import type {
  AgentEvent, ChatContentPart, ChatMessage, Language, PaperId,
  ConversationSummary, Conversation,
} from '@shared/types'
import { runAgentLoop } from '@shared/agent/loop'
import { buildSystemPrompt } from '@shared/agent/prompt'
import { createProvider, type NormalizedMessage, type ToolDef } from '@shared/agent/providers'
import { getProviderDefinition } from '@shared/providers'
import { dispatchWebTool, WEB_TOOL_DEFS } from './webTools'
import type { Library } from '@shared/paperdb/store'

const CONV_LS_KEY = 'verko:conversations'

interface PersistedConv {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messages: ChatMessage[]
}

function loadAll(): PersistedConv[] {
  try {
    const raw = localStorage.getItem(CONV_LS_KEY)
    if (!raw) return []
    return JSON.parse(raw) as PersistedConv[]
  } catch {
    return []
  }
}

function saveAll(convs: PersistedConv[]): void {
  try {
    localStorage.setItem(CONV_LS_KEY, JSON.stringify(convs))
  } catch {
    // localStorage full / blocked
  }
}

function defaultTitle(at: number): string {
  const d = new Date(at)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `New chat ${y}-${m}-${day} ${hh}:${mm}`
}

/**
 * Browser-side agent gateway. Mirrors the desktop AgentSession API but runs
 * the loop in the renderer using the web tool subset and localStorage-backed
 * conversation persistence.
 */
export class WebAgent {
  private aborts = new Map<string, AbortController>()
  private subscribers = new Set<(env: { conversationId: string; event: AgentEvent }) => void>()

  constructor(
    private getLibrary: () => Library | null,
    private getDescribe: () => string,
    private getApiKey: (providerId: string) => string | null,
  ) {}

  // ── Subscriptions (mirror IPC's onEvent envelope) ───────────────────────

  subscribe(cb: (env: { conversationId: string; event: AgentEvent }) => void): () => void {
    this.subscribers.add(cb)
    return () => this.subscribers.delete(cb)
  }

  private emit(conversationId: string, event: AgentEvent): void {
    for (const cb of this.subscribers) cb({ conversationId, event })
  }

  // ── Conversation persistence ────────────────────────────────────────────

  listConversations(): ConversationSummary[] {
    return loadAll()
      .map((c) => ({
        id: c.id,
        title: c.title,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        messageCount: c.messages.length,
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }

  getConversation(id: string): Conversation {
    const c = loadAll().find((x) => x.id === id)
    if (!c) throw new Error(`Conversation "${id}" not found`)
    return { ...c, messageCount: c.messages.length }
  }

  createConversation(title?: string): ConversationSummary {
    const now = Date.now()
    const conv: PersistedConv = {
      id: crypto.randomUUID(),
      title: title ?? defaultTitle(now),
      createdAt: now,
      updatedAt: now,
      messages: [],
    }
    const all = loadAll()
    all.push(conv)
    saveAll(all)
    return { id: conv.id, title: conv.title, createdAt: now, updatedAt: now, messageCount: 0 }
  }

  renameConversation(id: string, title: string): void {
    const all = loadAll()
    const c = all.find((x) => x.id === id)
    if (!c) return
    c.title = title
    c.updatedAt = Date.now()
    saveAll(all)
  }

  deleteConversation(id: string): void {
    saveAll(loadAll().filter((c) => c.id !== id))
    this.aborts.get(id)?.abort()
    this.aborts.delete(id)
  }

  private append(id: string, msg: ChatMessage): void {
    const all = loadAll()
    const c = all.find((x) => x.id === id)
    if (!c) return
    c.messages.push({ ...msg, createdAt: msg.createdAt ?? Date.now() })
    c.updatedAt = Date.now()
    if (c.title.startsWith('New chat') && msg.role === 'user') {
      const text = msg.content.find((p) => p.type === 'text')
      if (text && text.type === 'text' && text.text.trim()) {
        c.title = text.text.trim().slice(0, 60).replace(/\s+/g, ' ')
      }
    }
    saveAll(all)
  }

  // ── Send (mirror desktop AgentSession.send) ─────────────────────────────

  async send(
    userText: string,
    attachments: ChatContentPart[] | undefined,
    currentPaperId: PaperId | undefined,
    language: Language | undefined,
    conversationId: string | undefined,
    activeProfileId: string,
  ): Promise<string> {
    let convId = conversationId
    if (!convId) convId = this.createConversation().id

    const definition = getProviderDefinition(activeProfileId)
    if (!definition) {
      this.emit(convId, { type: 'error', message: `Unknown provider "${activeProfileId}".` })
      this.emit(convId, { type: 'done' })
      return convId
    }

    const apiKey = this.getApiKey(activeProfileId)
    if (!apiKey) {
      this.emit(convId, { type: 'error', message: `No API key set for ${definition.name}. Add one in settings.` })
      this.emit(convId, { type: 'done' })
      return convId
    }

    const lib = this.getLibrary()
    if (!lib) {
      this.emit(convId, { type: 'error', message: 'No active library.' })
      this.emit(convId, { type: 'done' })
      return convId
    }

    const provider = createProvider({
      protocol: definition.protocol,
      baseUrl: definition.defaults.baseUrl,
      apiKey,
      model: definition.defaults.model,
    })

    const systemPrompt = buildSystemPrompt(language ?? 'en', {
      libraryName: this.getDescribe(),
      libraryRoot: lib.backend.describe(),
      currentDate: new Date().toISOString().split('T')[0],
      currentPaperId,
    })

    // Hydrate from disk (no in-memory cache; the loop mutates this array).
    const persisted = loadAll().find((c) => c.id === convId)
    const messages: NormalizedMessage[] = (persisted?.messages ?? []).map(chatToNormalized)

    const userParts: ChatContentPart[] = [{ type: 'text', text: userText }, ...(attachments ?? [])]
    const userMsg: NormalizedMessage = { role: 'user', content: userParts }
    messages.push(userMsg)
    this.append(convId, normalizedToChat(userMsg))

    this.aborts.get(convId)?.abort()
    const ctrl = new AbortController()
    this.aborts.set(convId, ctrl)

    const tools: ToolDef[] = WEB_TOOL_DEFS

    void runAgentLoop({
      provider,
      systemPrompt,
      messages,
      tools,
      maxTurns: 10,
      temperature: 0.3,
      dispatchTool: (name, args) => dispatchWebTool(name, args, lib),
      onEvent: (ev) => this.emit(convId!, ev),
      onMessage: (msg) => this.append(convId!, normalizedToChat(msg)),
      abortSignal: ctrl.signal,
    }).finally(() => {
      if (this.aborts.get(convId!) === ctrl) this.aborts.delete(convId!)
    })

    return convId
  }

  abort(conversationId?: string): void {
    if (conversationId) {
      this.aborts.get(conversationId)?.abort()
      return
    }
    for (const c of this.aborts.values()) c.abort()
  }
}

// ── Conversion helpers ────────────────────────────────────────────────────

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
