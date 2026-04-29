import type { AppState } from '../ipc/index'
import type { AgentEvent, ChatContentPart, ChatMessage, Language, PaperId } from '@shared/types'
import { getActiveProfile, getConfig } from './config'
import { TOOL_DEFINITIONS } from './tools'
import { runAgentLoop } from './loop'
import { buildSystemPrompt } from './prompt'
import { ConversationStore } from './conversations'
import { createProvider, type NormalizedMessage, type ToolDef } from './providers'

const TOOL_DEFS_NORMALIZED: ToolDef[] = TOOL_DEFINITIONS.map((t) => {
  // OpenAI's typing widened ChatCompletionTool to a discriminated union, but
  // every tool we author is `type: 'function'` — narrow back.
  const fnTool = t as Extract<typeof t, { type: 'function' }>
  return {
    name: fnTool.function.name,
    description: fnTool.function.description ?? '',
    parameters: (fnTool.function.parameters as Record<string, unknown> | undefined) ?? {
      type: 'object', properties: {},
    },
  }
})

/**
 * Multi-conversation agent gateway.
 *
 * - Each conversation is keyed by `id` and persisted to disk via ConversationStore.
 * - In-memory cache of message arrays keeps streaming hot; on every assistant /
 *   tool message we write through to disk.
 * - One AbortController per conversation lets the user cancel one chat without
 *   killing others.
 * - The renderer is responsible for choosing which conversation to send into;
 *   `agent:send` returns the conversationId so a fresh chat from a blank slate
 *   gets created on demand.
 */
export class AgentSession {
  private conversations = new Map<string, NormalizedMessage[]>()
  private aborts = new Map<string, AbortController>()
  private store: ConversationStore

  constructor(private readonly appState: AppState) {
    this.store = ConversationStore.fromUserData()
  }

  async send(
    userText: string,
    attachments: ChatContentPart[] | undefined,
    currentPaperId: PaperId | undefined,
    language: Language | undefined,
    conversationId: string | undefined,
    onEvent: (ev: AgentEvent) => void,
  ): Promise<string> {
    // Resolve / create the conversation.
    let convId = conversationId
    if (!convId) {
      const c = await this.store.create()
      convId = c.id
    }

    const profile = getActiveProfile()
    if (!profile.key) {
      onEvent({ type: 'error', message: `No API key set for profile "${profile.name}". Please add a key in settings.` })
      onEvent({ type: 'done' })
      return convId
    }

    const config = getConfig()
    const provider = createProvider({
      protocol: profile.protocol,
      baseUrl: profile.baseUrl,
      apiKey: profile.key,
      model: profile.model,
    })

    const systemPrompt = buildSystemPrompt(language ?? 'en', {
      libraryName: this.appState.manager?.activeName ?? 'My Library',
      libraryRoot: this.appState.manager?.hasActive() ? this.appState.library.backend.describe() : '(no library)',
      currentDate: new Date().toISOString().split('T')[0],
      currentPaperId,
    })

    // Hydrate the in-memory cache from disk on first use.
    let messages = this.conversations.get(convId)
    if (!messages) {
      try {
        const conv = await this.store.get(convId)
        messages = conv.messages.map(chatToNormalized)
      } catch {
        messages = []
      }
      this.conversations.set(convId, messages)
    }

    // Build the user message + persist it.
    const userParts: ChatContentPart[] = [
      { type: 'text', text: userText },
      ...(attachments ?? []),
    ]
    const userMsg: NormalizedMessage = { role: 'user', content: userParts }
    messages.push(userMsg)
    await this.store.append(convId, normalizedToChat(userMsg))

    // Cancel any in-flight call on this conversation.
    this.aborts.get(convId)?.abort()
    const ctrl = new AbortController()
    this.aborts.set(convId, ctrl)

    if (!this.appState.manager?.hasActive()) {
      onEvent({ type: 'error', message: 'No active library. Open or create one first.' })
      onEvent({ type: 'done' })
      return convId
    }

    runAgentLoop({
      provider,
      systemPrompt,
      messages,
      tools: TOOL_DEFS_NORMALIZED,
      maxTurns: config.maxTurns,
      temperature: config.temperature,
      ctx: { library: this.appState.library, manager: this.appState.manager! },
      onEvent,
      onMessage: (msg) => { void this.store.append(convId!, normalizedToChat(msg)) },
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

  /** Drop in-memory cache when a conversation is deleted. */
  forget(conversationId: string): void {
    this.conversations.delete(conversationId)
    this.aborts.get(conversationId)?.abort()
    this.aborts.delete(conversationId)
  }
}

// ── Normalization ↔ persistence ────────────────────────────────────────────

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
