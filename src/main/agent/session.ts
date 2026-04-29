import OpenAI from 'openai'
import type { AgentEvent, Language } from '@shared/types'
import type { Library } from '@main/paperdb/store'
import type { LibraryManager } from '@main/paperdb/manager'
import { getConfig, getActiveProfile } from './config'
import { createClient } from './client'
import { runAgentLoop } from './loop'
import { buildSystemPrompt } from './prompt'
import { TOOL_DEFINITIONS } from './tools'

/**
 * One conversational session with the AI agent.
 *
 * Owns the chat history (kept in memory for the lifetime of the
 * session) and exposes streaming-style messaging via `send`. Each call
 * runs an OpenAI-compatible tool loop that may invoke library tools
 * (search, read, write papers, manage collections) before responding.
 *
 * Streamed output is delivered through the `onEvent` callback as a
 * sequence of `AgentEvent`s, terminated by `{ type: 'done' }`.
 */
export class AgentSession {
  private history: OpenAI.Chat.ChatCompletionMessageParam[] = []
  private abortController: AbortController | null = null

  constructor(private appState: { library: Library; manager: LibraryManager | null }) {}

  /**
   * Send a user message and stream the agent's response.
   * Uses the active profile from settings; emits an `error` event if no
   * key is configured. Safe to call concurrently — each call runs its
   * own tool loop, but `abort` cancels whichever call is in flight.
   */
  async send(
    userMessage: string,
    onEvent: (event: AgentEvent) => void,
    currentPaperId?: string,
    language: Language = 'en',
  ): Promise<void> {
    const config = getConfig()
    let profile: ReturnType<typeof getActiveProfile>
    try {
      profile = getActiveProfile()
    } catch (e) {
      onEvent({
        type: 'error',
        message: e instanceof Error ? e.message : 'Failed to load active profile'
      })
      onEvent({ type: 'done' })
      return
    }

    if (!profile.key) {
      onEvent({
        type: 'error',
        message: `No API key set for profile "${profile.name}". Please add a key in settings.`
      })
      onEvent({ type: 'done' })
      return
    }

    // Build system prompt in the user's UI language. Tool semantics stay
    // identical across languages — only the surface wording changes.
    const systemPrompt = buildSystemPrompt(language, {
      libraryName: this.appState.manager?.activeName ?? 'My Library',
      libraryRoot: this.appState.library.backend.describe(),
      currentDate: new Date().toISOString().split('T')[0],
      currentPaperId,
    })

    // Push user message to history
    this.history.push({ role: 'user', content: userMessage })

    // Build messages array: system + full history
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...this.history
    ]

    // Create client
    const client = createClient(profile.baseUrl, profile.key)

    // Create abort controller for this request
    this.abortController = new AbortController()

    // Track how many messages exist before the loop so we can extract assistant turns
    const historyLengthBefore = this.history.length

    try {
      await runAgentLoop({
        client,
        model: profile.model,
        messages,
        tools: TOOL_DEFINITIONS,
        maxTurns: config.maxTurns,
        temperature: config.temperature,
        ctx: {
          library: this.appState.library,
          manager: this.appState.manager!
        },
        onEvent,
        abortSignal: this.abortController.signal
      })
    } finally {
      this.abortController = null
    }

    // The loop mutates `messages` in-place by appending assistant + tool messages.
    // We need to sync back those new turns into this.history.
    // messages = [system, ...history_before, ...new_turns]
    // new_turns start at index: 1 + historyLengthBefore
    const newTurns = messages.slice(1 + historyLengthBefore)
    for (const turn of newTurns) {
      this.history.push(turn)
    }
  }

  abort(): void {
    if (this.abortController) {
      this.abortController.abort()
    }
  }

  clearHistory(): void {
    this.history = []
  }

  getHistory(): OpenAI.Chat.ChatCompletionMessageParam[] {
    return [...this.history]
  }
}
