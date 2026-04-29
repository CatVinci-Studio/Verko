import OpenAI from 'openai'
import type { AgentEvent } from '@shared/types'
import type { Library } from '@main/paperdb/store'
import type { LibraryManager } from '@main/paperdb/manager'
import { dispatchTool } from './tools'

interface ToolCallAccum {
  id: string
  name: string
  args: string
}

export interface RunAgentLoopOptions {
  client: OpenAI
  model: string
  messages: OpenAI.Chat.ChatCompletionMessageParam[]
  tools: OpenAI.Chat.ChatCompletionTool[]
  maxTurns: number
  temperature: number
  ctx: { library: Library; manager: LibraryManager }
  onEvent: (event: AgentEvent) => void
  abortSignal: AbortSignal
}

export async function runAgentLoop(opts: RunAgentLoopOptions): Promise<void> {
  const { client, model, messages, tools, maxTurns, temperature, ctx, onEvent, abortSignal } = opts

  for (let turn = 0; turn < maxTurns; turn++) {
    if (abortSignal.aborted) {
      onEvent({ type: 'done' })
      return
    }

    // Accumulate tool call fragments across stream chunks
    const toolCallAccum: Record<number, ToolCallAccum> = {}
    let finishReason: string | null = null
    let assistantTextContent = ''

    try {
      const stream = client.beta.chat.completions.stream(
        {
          model,
          messages,
          tools,
          tool_choice: 'auto',
          temperature
        },
        { signal: abortSignal }
      )

      for await (const chunk of stream) {
        if (abortSignal.aborted) break

        const choice = chunk.choices[0]
        if (!choice) continue

        const delta = choice.delta

        // Accumulate text deltas
        if (delta.content) {
          assistantTextContent += delta.content
          onEvent({ type: 'text', delta: delta.content })
        }

        // Accumulate tool call argument fragments
        if (delta.tool_calls) {
          for (const tcDelta of delta.tool_calls) {
            const idx = tcDelta.index
            if (!toolCallAccum[idx]) {
              toolCallAccum[idx] = {
                id: tcDelta.id ?? '',
                name: tcDelta.function?.name ?? '',
                args: ''
              }
            }
            // Update id and name if provided in this chunk (may arrive in first chunk only)
            if (tcDelta.id) toolCallAccum[idx].id = tcDelta.id
            if (tcDelta.function?.name) toolCallAccum[idx].name = tcDelta.function.name
            if (tcDelta.function?.arguments) {
              toolCallAccum[idx].args += tcDelta.function.arguments
            }
          }
        }

        if (choice.finish_reason) {
          finishReason = choice.finish_reason
        }
      }
    } catch (e: unknown) {
      // Check for abort
      if (abortSignal.aborted) {
        onEvent({ type: 'done' })
        return
      }
      const msg = e instanceof Error ? e.message : String(e)
      onEvent({ type: 'error', message: msg })
      return
    }

    if (abortSignal.aborted) {
      onEvent({ type: 'done' })
      return
    }

    // --- Handle finish_reason ---

    if (finishReason === 'stop' || finishReason === 'length') {
      // Push the assistant message to history
      if (assistantTextContent) {
        messages.push({ role: 'assistant', content: assistantTextContent })
      }
      onEvent({ type: 'done' })
      return
    }

    if (finishReason === 'tool_calls') {
      const toolCalls = Object.values(toolCallAccum)

      // Build the assistant message with tool_calls
      const assistantMessage: OpenAI.Chat.ChatCompletionAssistantMessageParam = {
        role: 'assistant',
        content: assistantTextContent || null,
        tool_calls: toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: tc.name,
            arguments: tc.args
          }
        }))
      }
      messages.push(assistantMessage)

      // Execute each tool and collect results
      for (const tc of toolCalls) {
        let parsedArgs: Record<string, unknown> = {}
        try {
          parsedArgs = JSON.parse(tc.args) as Record<string, unknown>
        } catch {
          parsedArgs = {}
        }

        onEvent({ type: 'tool_start', name: tc.name, args: parsedArgs })

        let result: string
        try {
          result = await dispatchTool(tc.name, parsedArgs, ctx)
        } catch (e: unknown) {
          result = JSON.stringify({
            error: e instanceof Error ? e.message : String(e)
          })
        }

        onEvent({ type: 'tool_result', name: tc.name, result })

        // Push tool result to messages
        const toolResultMessage: OpenAI.Chat.ChatCompletionToolMessageParam = {
          role: 'tool',
          tool_call_id: tc.id,
          content: result
        }
        messages.push(toolResultMessage)
      }

      // Continue the loop for the next turn
      continue
    }

    // Unexpected finish_reason or null — treat as done
    onEvent({ type: 'done' })
    return
  }

  // Exceeded maxTurns
  onEvent({
    type: 'error',
    message: `Agent exceeded maximum turns (${maxTurns}). Stopping.`
  })
}
