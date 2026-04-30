import type { AgentEvent } from '../types'
import type { NormalizedMessage, ProviderProtocol, ToolDef } from './providers'

export interface RunAgentLoopOptions {
  provider: ProviderProtocol
  systemPrompt: string
  /** Mutated in-place: assistant + tool messages are appended as the loop runs. */
  messages: NormalizedMessage[]
  tools: ToolDef[]
  maxTurns: number
  temperature: number
  /** Tool dispatcher — must close over its own context (Library, manager, etc). */
  dispatchTool: (name: string, args: Record<string, unknown>) => Promise<string>
  onEvent: (event: AgentEvent) => void
  /** Called as each finalized assistant / tool message is appended. */
  onMessage: (msg: NormalizedMessage) => void
  abortSignal: AbortSignal
  /**
   * Optional: invoked at the start of every iteration with the current
   * messages array. Can mutate it (e.g. micro-compact) and/or return a
   * replacement (e.g. auto-compact when threshold exceeded). Returning
   * `null`/`undefined` means "keep the existing array".
   */
  beforeTurn?: (messages: NormalizedMessage[]) => Promise<NormalizedMessage[] | null | void>
  /** Tool name that signals "compact after this turn finishes". */
  compactToolName?: string
  /** Compaction implementation. Returns the replacement message list. */
  onCompact?: (messages: NormalizedMessage[]) => Promise<NormalizedMessage[]>
}

/**
 * Provider-agnostic, runtime-agnostic agent loop. Drive a single user turn
 * through the provider until the model says it is done.
 *
 * Each iteration: stream a response → execute any tool calls → loop.
 * `onEvent` streams to the renderer; `onMessage` persists each finalized
 * message so history survives crashes mid-turn.
 */
export async function runAgentLoop(opts: RunAgentLoopOptions): Promise<void> {
  const {
    provider, systemPrompt, messages, tools, maxTurns, temperature,
    dispatchTool, onEvent, onMessage, abortSignal,
    beforeTurn, compactToolName, onCompact,
  } = opts

  // Helper: replace `messages` in place with a new array.
  const replaceMessages = (next: NormalizedMessage[]): void => {
    messages.length = 0
    messages.push(...next)
  }

  for (let turn = 0; turn < maxTurns; turn++) {
    if (abortSignal.aborted) {
      onEvent({ type: 'done' })
      return
    }

    if (beforeTurn) {
      try {
        const replaced = await beforeTurn(messages)
        if (replaced) replaceMessages(replaced)
      } catch (e) {
        // Compaction failure is non-fatal — keep going with the original messages.
        onEvent({ type: 'error', message: `Compaction skipped: ${e instanceof Error ? e.message : String(e)}` })
      }
    }

    let assistantText = ''
    const toolCalls: Array<{ id: string; name: string; arguments: string }> = []
    let finishReason: 'stop' | 'tool_calls' | 'length' | 'other' = 'other'

    try {
      for await (const ev of provider.stream({
        model: '',  // unused — provider already has it
        systemPrompt,
        messages,
        tools,
        temperature,
        signal: abortSignal,
      })) {
        if (abortSignal.aborted) break
        if (ev.type === 'text') {
          assistantText += ev.delta
          onEvent({ type: 'text', delta: ev.delta })
        } else if (ev.type === 'tool_call') {
          toolCalls.push({ id: ev.id, name: ev.name, arguments: ev.arguments })
        } else if (ev.type === 'finish') {
          finishReason = ev.reason
        }
      }
    } catch (e) {
      if (abortSignal.aborted) {
        onEvent({ type: 'done' })
        return
      }
      onEvent({ type: 'error', message: e instanceof Error ? e.message : String(e) })
      return
    }

    if (abortSignal.aborted) {
      onEvent({ type: 'done' })
      return
    }

    const assistantMsg: NormalizedMessage = {
      role: 'assistant',
      content: assistantText ? [{ type: 'text', text: assistantText }] : [],
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    }
    messages.push(assistantMsg)
    onMessage(assistantMsg)

    if (finishReason !== 'tool_calls' && toolCalls.length === 0) {
      onEvent({ type: 'done' })
      return
    }

    let manualCompactRequested = false
    for (const tc of toolCalls) {
      let parsed: Record<string, unknown> = {}
      try { parsed = JSON.parse(tc.arguments || '{}') } catch { /* keep {} */ }

      onEvent({ type: 'tool_start', name: tc.name, args: parsed })
      let result: string
      try {
        result = await dispatchTool(tc.name, parsed)
      } catch (e) {
        result = JSON.stringify({ error: e instanceof Error ? e.message : String(e) })
      }
      onEvent({ type: 'tool_result', name: tc.name, result })

      const toolMsg: NormalizedMessage = {
        role: 'tool',
        toolCallId: tc.id,
        toolName: tc.name,
        content: [{ type: 'text', text: result }],
      }
      messages.push(toolMsg)
      onMessage(toolMsg)

      if (compactToolName && tc.name === compactToolName) {
        manualCompactRequested = true
      }
    }

    if (manualCompactRequested && onCompact) {
      try {
        const replaced = await onCompact(messages)
        replaceMessages(replaced)
        onEvent({ type: 'compacted' })
      } catch (e) {
        onEvent({ type: 'error', message: `Manual compaction failed: ${e instanceof Error ? e.message : String(e)}` })
      }
    }
  }

  onEvent({ type: 'error', message: `Agent exceeded maximum turns (${maxTurns}). Stopping.` })
}
