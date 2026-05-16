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
  /** Whether `name` is safe to dispatch concurrently with other tools. */
  isParallelSafe?(name: string): boolean
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

  /**
   * Fire-and-forget worker run. Doesn't touch ConversationStore, doesn't
   * surface in the conversation list, doesn't emit events. Used for the
   * post-ingest auto-summarize pass: the user dropped a URL, the row is
   * already in the inbox, and we want a brief filled in without opening
   * a chat panel.
   *
   * The prompt is the entire user message; tool calls go through the
   * normal dispatcher so paper-mutating tools (update_paper, append_note)
   * write directly to the library.
   *
   * Returns when the loop terminates (success, error, or maxTurns).
   * Errors are swallowed and logged — the caller should not fail the
   * primary user action on a background summarization failure.
   */
  async runWorker(userText: string, currentPaperId?: PaperId): Promise<void> {
    const resolved = await this.ports.getProvider()
    if (!resolved) return

    const snapshot = await this.ports.describeContext()
    const systemPrompt = buildSystemPrompt('en', {
      ...snapshot,
      currentDate: new Date().toISOString().split('T')[0],
      currentPaperId,
    })

    const ctrl = new AbortController()
    try {
      await runAgentLoop({
        provider: resolved.provider,
        systemPrompt,
        messages: [{ role: 'user', content: [{ type: 'text', text: userText }] }],
        tools: this.ports.getTools(),
        // Workers should converge fast; capping turns keeps stuck runs from
        // burning tokens. summary + body rewrite is ~2-3 turns end to end.
        maxTurns: 4,
        temperature: this.ports.temperature,
        dispatchTool: (name, args) => this.ports.dispatchTool(name, args),
        isParallelSafe: this.ports.isParallelSafe,
        onEvent: () => {},
        onMessage: () => {},
        abortSignal: ctrl.signal,
      })
    } catch (e) {
      // Background work — log only.
      console.warn('[agent worker]', e instanceof Error ? e.message : String(e))
    }
  }

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

    // Heal any tool-round left dangling by a previous aborted turn. If the
    // last assistant in history has tool_calls and we never persisted a
    // tool response for some of them, OpenAI rejects the next call with
    // "tool message must follow tool_calls". Synthesise stub responses
    // for the missing ids and persist them so the round is closed.
    const stubs = stubMissingToolResponses(messages)
    for (const stub of stubs) {
      await this.ports.store.append(convId, normalizedToChat(stub))
    }

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

    // ConversationStore.append is read-modify-write, so concurrent calls
    // race: assistant{tool_calls} and its tool response can both read the
    // pre-write state and the second write clobbers the first. The model
    // then replays a torn history (tool with no preceding tool_calls) and
    // OpenAI/Anthropic 400. Serialise per-Agent.send so the appends fire
    // in loop order.
    let appendQueue: Promise<unknown> = Promise.resolve()
    const queuedAppend = (msg: NormalizedMessage): void => {
      appendQueue = appendQueue
        .then(() => ports.store.append(convId!, normalizedToChat(msg)))
        .catch((e) => console.error('[agent] persist failed:', e))
    }

    void runAgentLoop({
      provider,
      systemPrompt,
      messages,
      tools: ports.getTools(),
      maxTurns: ports.maxTurns,
      temperature: ports.temperature,
      dispatchTool: (name, args) => ports.dispatchTool(name, args),
      isParallelSafe: ports.isParallelSafe,
      onEvent: (ev) => this.emit(convId!, ev),
      onMessage: queuedAppend,
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

/**
 * Repair a torn tool round at the tail of `messages` by mutating it in
 * place. Walks back to the most recent assistant with `toolCalls`,
 * collects tool responses that follow it, and synthesises stub `tool`
 * messages for any tool_call ids that lack one. Returns the stubs
 * (already inserted) so the caller can persist them.
 *
 * Triggered when a previous turn was aborted mid-dispatch — without
 * this, OpenAI rejects the next call with "tool message must follow
 * tool_calls".
 */
function stubMissingToolResponses(messages: NormalizedMessage[]): NormalizedMessage[] {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role !== 'assistant' || !m.toolCalls?.length) continue

    // Collect existing tool responses sitting between this assistant
    // and the next non-tool message.
    const responded = new Set<string>()
    let insertAt = i + 1
    while (insertAt < messages.length && messages[insertAt].role === 'tool') {
      const id = messages[insertAt].toolCallId
      if (id) responded.add(id)
      insertAt++
    }

    const missing = m.toolCalls.filter((tc) => !responded.has(tc.id))
    if (missing.length === 0) return []

    const stubs: NormalizedMessage[] = missing.map((tc) => ({
      role: 'tool',
      toolCallId: tc.id,
      toolName: tc.name,
      content: [{ type: 'text', text: '[Tool call aborted]' }],
    }))
    messages.splice(insertAt, 0, ...stubs)
    return stubs
  }
  return []
}
