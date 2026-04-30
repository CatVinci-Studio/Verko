import type {
  AgentEvent, AgentEventEnvelope, ChatContentPart, ChatMessage,
  ConversationSummary, Conversation, Language, PaperId,
} from '@shared/types'
import { runAgentLoop } from './loop'
import { buildSystemPrompt } from './prompt'
import type { NormalizedMessage, ProviderProtocol, ToolDef } from './providers'
import type { ConversationStore } from './conversationStore'
import { microCompact, autoCompact, estimateTokens, TOKEN_THRESHOLD } from './compact'

export interface LibrarySnapshot {
  libraryName: string
  libraryRoot: string
  paperCount: number
  collections: Array<{ name: string; paperCount: number }>
  /** Schema columns the user added beyond the defaults (custom fields). */
  customColumns: Array<{ name: string; type: string }>
  /** User-authored skills available via `load_skill`. */
  skills: Array<{ name: string; description: string }>
}

export interface AgentPorts {
  /** Resolve the active provider. Called per-send so config edits take effect. */
  getProvider(): Promise<{ provider: ProviderProtocol; model: string } | null>
  /** Library snapshot for the system prompt. Async so it can read live state. */
  describeContext(): Promise<LibrarySnapshot>
  /** Tool definitions the LLM is allowed to call. */
  getTools(): ToolDef[]
  /** Run a tool call locally and return the JSON-string result. */
  dispatchTool(name: string, args: Record<string, unknown>): Promise<string>
  /** Conversation persistence. */
  store: ConversationStore
  /**
   * Persist a full pre-compaction transcript. Returns a label (file path,
   * key, …) that gets embedded in the placeholder message. Optional: web
   * builds with no durable scratch space can return null.
   */
  saveTranscript?: (conversationId: string, messages: NormalizedMessage[]) => Promise<string | null>
  /** Loop config knobs. */
  maxTurns: number
  temperature: number
}

/**
 * Runtime-neutral agent. Owns: subscribers, abort controllers, send loop.
 * All side effects route through `AgentPorts`. Web and desktop instantiate
 * with their own port implementations.
 */
export class Agent {
  private aborts = new Map<string, AbortController>()
  private subscribers = new Set<(env: AgentEventEnvelope) => void>()

  constructor(private readonly ports: AgentPorts) {}

  // ── Subscriptions ────────────────────────────────────────────────────────

  subscribe(cb: (env: AgentEventEnvelope) => void): () => void {
    this.subscribers.add(cb)
    return () => this.subscribers.delete(cb)
  }

  private emit(conversationId: string, event: AgentEvent): void {
    for (const cb of this.subscribers) cb({ conversationId, event })
  }

  abort(conversationId?: string): void {
    if (conversationId) {
      this.aborts.get(conversationId)?.abort()
      return
    }
    for (const c of this.aborts.values()) c.abort()
  }

  /**
   * User-initiated compaction. Aborts any in-flight stream on this
   * conversation, runs `autoCompact` on its persisted history, and writes
   * the compressed messages back to disk. Emits a `compacted` event so
   * the UI can render its marker.
   */
  async compact(conversationId: string): Promise<void> {
    this.aborts.get(conversationId)?.abort()
    this.aborts.delete(conversationId)

    let conv: Conversation
    try {
      conv = await this.ports.store.get(conversationId)
    } catch (e) {
      this.emit(conversationId, { type: 'error', message: `Cannot compact: ${e instanceof Error ? e.message : String(e)}` })
      return
    }
    if (conv.messages.length === 0) return

    const resolved = await this.ports.getProvider()
    if (!resolved) {
      this.emit(conversationId, { type: 'error', message: 'Cannot compact: no active provider / API key.' })
      return
    }

    const snapshot = await this.ports.describeContext()
    const systemPrompt = buildSystemPrompt('en', {
      ...snapshot,
      currentDate: new Date().toISOString().split('T')[0],
    })

    const normalized: NormalizedMessage[] = conv.messages.map(chatToNormalized)
    let compacted: NormalizedMessage[]
    try {
      compacted = await autoCompact(normalized, {
        provider: resolved.provider,
        systemPrompt,
        saveTranscript: (snap) =>
          this.ports.saveTranscript ? this.ports.saveTranscript(conversationId, snap) : Promise.resolve(null),
      })
    } catch (e) {
      this.emit(conversationId, { type: 'error', message: `Compaction failed: ${e instanceof Error ? e.message : String(e)}` })
      return
    }

    conv.messages = compacted.map(normalizedToChat)
    await this.ports.store.save(conv)
    this.emit(conversationId, { type: 'compacted' })
  }

  // ── Conversation passthrough ─────────────────────────────────────────────

  listConversations(): Promise<ConversationSummary[]> {
    return this.ports.store.list()
  }

  getConversation(id: string): Promise<Conversation> {
    return this.ports.store.get(id)
  }

  async createConversation(title?: string): Promise<ConversationSummary> {
    const c = await this.ports.store.create(title)
    return { id: c.id, title: c.title, createdAt: c.createdAt, updatedAt: c.updatedAt, messageCount: 0 }
  }

  renameConversation(id: string, title: string): Promise<void> {
    return this.ports.store.rename(id, title)
  }

  async deleteConversation(id: string): Promise<void> {
    await this.ports.store.delete(id)
    this.aborts.get(id)?.abort()
    this.aborts.delete(id)
  }

  // ── Send ─────────────────────────────────────────────────────────────────

  async send(
    userText: string,
    attachments: ChatContentPart[] | undefined,
    currentPaperId: PaperId | undefined,
    language: Language | undefined,
    conversationId: string | undefined,
  ): Promise<string> {
    let convId = conversationId
    if (!convId) convId = (await this.createConversation()).id

    const resolved = await this.ports.getProvider()
    if (!resolved) {
      this.emit(convId, { type: 'error', message: 'No active provider / API key.' })
      this.emit(convId, { type: 'done' })
      return convId
    }

    const snapshot = await this.ports.describeContext()
    const systemPrompt = buildSystemPrompt(language ?? 'en', {
      ...snapshot,
      currentDate: new Date().toISOString().split('T')[0],
      currentPaperId,
    })

    let persisted: Conversation | null = null
    try {
      persisted = await this.ports.store.get(convId)
    } catch {
      // first message in this conversation
    }
    const messages: NormalizedMessage[] = (persisted?.messages ?? []).map(chatToNormalized)

    const userParts: ChatContentPart[] = [{ type: 'text', text: userText }, ...(attachments ?? [])]
    const userMsg: NormalizedMessage = { role: 'user', content: userParts }
    messages.push(userMsg)
    await this.ports.store.append(convId, normalizedToChat(userMsg))

    this.aborts.get(convId)?.abort()
    const ctrl = new AbortController()
    this.aborts.set(convId, ctrl)

    const provider = resolved.provider
    const ports = this.ports

    const runCompact = async (msgs: NormalizedMessage[]): Promise<NormalizedMessage[]> => {
      return autoCompact(msgs, {
        provider,
        systemPrompt,
        saveTranscript: (snapshot) =>
          ports.saveTranscript ? ports.saveTranscript(convId!, snapshot) : Promise.resolve(null),
      })
    }

    void runAgentLoop({
      provider,
      systemPrompt,
      messages,
      tools: ports.getTools(),
      maxTurns: ports.maxTurns,
      temperature: ports.temperature,
      dispatchTool: (name, args) => ports.dispatchTool(name, args),
      onEvent: (ev) => this.emit(convId!, ev),
      onMessage: (msg) => { void ports.store.append(convId!, normalizedToChat(msg)) },
      abortSignal: ctrl.signal,
      // L1: silent micro compaction every turn.
      // L2: auto compaction when we cross the token threshold.
      beforeTurn: async (msgs) => {
        microCompact(msgs)
        if (estimateTokens(msgs) > TOKEN_THRESHOLD) {
          const replaced = await runCompact(msgs)
          this.emit(convId!, { type: 'compacted' })
          return replaced
        }
        return null
      },
      // L3: model can call `compact` to trigger same auto-compact path.
      compactToolName: 'compact',
      onCompact: runCompact,
    }).finally(() => {
      if (this.aborts.get(convId!) === ctrl) this.aborts.delete(convId!)
    })

    return convId
  }
}

function normalizedToChat(m: NormalizedMessage): ChatMessage {
  return {
    role: m.role,
    content: m.content,
    toolCalls: m.toolCalls,
    toolCallId: m.toolCallId,
    toolName: m.toolName,
  }
}

function chatToNormalized(m: ChatMessage): NormalizedMessage {
  return {
    role: m.role,
    content: m.content,
    toolCalls: m.toolCalls,
    toolCallId: m.toolCallId,
    toolName: m.toolName,
  }
}
