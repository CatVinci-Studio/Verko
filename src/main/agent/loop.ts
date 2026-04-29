import type { AgentEvent } from '@shared/types'
import type { Library } from '@main/paperdb/store'
import type { LibraryManager } from '@main/paperdb/manager'
import { dispatchTool } from './tools'
import type { NormalizedMessage, ProviderProtocol, ToolDef } from './providers'

export interface RunAgentLoopOptions {
  provider: ProviderProtocol
  systemPrompt: string
  /** Mutated in-place: assistant + tool messages are appended as the loop runs. */
  messages: NormalizedMessage[]
  tools: ToolDef[]
  maxTurns: number
  temperature: number
  ctx: { library: Library; manager: LibraryManager }
  onEvent: (event: AgentEvent) => void
  onMessage: (msg: NormalizedMessage) => void  // persistence hook
  abortSignal: AbortSignal
}

/**
 * Drive a single user turn through the provider until the model says it is done.
 * Each iteration: stream a response → if tool calls, execute them → loop.
 *
 * `onEvent` streams to the renderer. `onMessage` persists each finalized message
 * so that history survives crashes mid-turn (the loop may execute many tool calls
 * before the model writes its final reply).
 */
export async function runAgentLoop(opts: RunAgentLoopOptions): Promise<void> {
  const { provider, systemPrompt, messages, tools, maxTurns, temperature, ctx, onEvent, onMessage, abortSignal } = opts

  for (let turn = 0; turn < maxTurns; turn++) {
    if (abortSignal.aborted) {
      onEvent({ type: 'done' })
      return
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

    // Persist the assistant turn (text + any tool_use calls).
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

    // Execute every tool call, append a tool-role message per result.
    for (const tc of toolCalls) {
      let parsed: Record<string, unknown> = {}
      try { parsed = JSON.parse(tc.arguments || '{}') } catch { /* keep {} */ }

      onEvent({ type: 'tool_start', name: tc.name, args: parsed })
      let result: string
      try {
        result = await dispatchTool(tc.name, parsed, ctx)
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
    }
    // Loop continues for the next turn.
  }

  onEvent({ type: 'error', message: `Agent exceeded maximum turns (${maxTurns}). Stopping.` })
}
