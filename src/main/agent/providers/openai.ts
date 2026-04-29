import OpenAI from 'openai'
import type {
  ContentPart,
  NormalizedMessage,
  ProviderConfig,
  ProviderProtocol,
  StreamEvent,
  StreamOptions,
} from './types'

interface ToolCallAccum {
  id: string
  name: string
  args: string
}

export class OpenAIProtocol implements ProviderProtocol {
  private client: OpenAI

  constructor(public readonly config: ProviderConfig) {
    this.client = new OpenAI({
      baseURL: config.baseUrl || 'https://api.openai.com/v1',
      apiKey: config.apiKey,
    })
  }

  async testConnection(): Promise<boolean> {
    try {
      const r = await this.client.chat.completions.create({
        model: this.config.model,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1,
      })
      return r.choices.length > 0
    } catch {
      return false
    }
  }

  async *stream(opts: StreamOptions): AsyncIterable<StreamEvent> {
    const oaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: opts.systemPrompt },
      ...opts.messages.map(toOpenAIMessage),
    ]
    const tools: OpenAI.Chat.ChatCompletionTool[] = opts.tools.map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }))

    const stream = this.client.chat.completions.stream(
      {
        model: this.config.model,
        messages: oaiMessages,
        tools,
        tool_choice: tools.length > 0 ? 'auto' : undefined,
        temperature: opts.temperature,
      },
      { signal: opts.signal },
    )

    const accum: Record<number, ToolCallAccum> = {}
    let finishReason: string | null = null

    for await (const chunk of stream) {
      if (opts.signal.aborted) break
      const choice = chunk.choices[0]
      if (!choice) continue
      const delta = choice.delta

      if (delta.content) yield { type: 'text', delta: delta.content }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index
          if (!accum[idx]) accum[idx] = { id: tc.id ?? '', name: tc.function?.name ?? '', args: '' }
          if (tc.id) accum[idx].id = tc.id
          if (tc.function?.name) accum[idx].name = tc.function.name
          if (tc.function?.arguments) accum[idx].args += tc.function.arguments
        }
      }

      if (choice.finish_reason) finishReason = choice.finish_reason
    }

    for (const tc of Object.values(accum)) {
      yield { type: 'tool_call', id: tc.id, name: tc.name, arguments: tc.args }
    }

    yield { type: 'finish', reason: normalizeFinish(finishReason) }
  }
}

function normalizeFinish(r: string | null): 'stop' | 'tool_calls' | 'length' | 'other' {
  if (r === 'stop') return 'stop'
  if (r === 'tool_calls') return 'tool_calls'
  if (r === 'length') return 'length'
  return 'other'
}

function toOpenAIMessage(m: NormalizedMessage): OpenAI.Chat.ChatCompletionMessageParam {
  if (m.role === 'tool') {
    return {
      role: 'tool',
      tool_call_id: m.toolCallId!,
      content: contentToText(m.content),
    }
  }
  if (m.role === 'assistant') {
    if (m.toolCalls && m.toolCalls.length > 0) {
      return {
        role: 'assistant',
        content: contentToText(m.content) || null,
        tool_calls: m.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.name, arguments: tc.arguments },
        })),
      }
    }
    return { role: 'assistant', content: contentToText(m.content) }
  }
  // user
  if (m.content.every((p) => p.type === 'text')) {
    return { role: 'user', content: contentToText(m.content) }
  }
  return {
    role: 'user',
    content: m.content.map((p): OpenAI.Chat.ChatCompletionContentPart => {
      if (p.type === 'text') return { type: 'text', text: p.text }
      return { type: 'image_url', image_url: { url: `data:${p.mimeType};base64,${p.data}` } }
    }),
  }
}

function contentToText(parts: ContentPart[]): string {
  return parts.filter((p): p is { type: 'text'; text: string } => p.type === 'text').map((p) => p.text).join('')
}
