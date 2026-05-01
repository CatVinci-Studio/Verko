import Anthropic from '@anthropic-ai/sdk'
import type {
  ContentPart,
  NormalizedMessage,
  ProviderConfig,
  ProviderProtocol,
  StreamEvent,
  StreamOptions,
} from './types'

export class AnthropicProtocol implements ProviderProtocol {
  private client: Anthropic

  constructor(public readonly config: ProviderConfig) {
    this.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseUrl || undefined,
      dangerouslyAllowBrowser: typeof window !== 'undefined',
    })
  }

  async testConnection(): Promise<boolean> {
    // Anthropic has no models.list endpoint. countTokens is free and
    // validates auth without burning quota.
    try {
      await this.client.messages.countTokens({
        model: this.config.model,
        messages: [{ role: 'user', content: 'hi' }],
      })
      return true
    } catch {
      return false
    }
  }

  async *stream(opts: StreamOptions): AsyncIterable<StreamEvent> {
    const messages = opts.messages.map(toAnthropicMessage)
    const tools = opts.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters as Anthropic.Tool.InputSchema,
    }))

    const body = {
      model: this.config.model,
      max_tokens: 4096,
      system: opts.systemPrompt,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      temperature: opts.temperature,
    }
    opts.onRawRequest?.(body)
    const stream = this.client.messages.stream(body, { signal: opts.signal })

    // Track tool uses by index so we can yield them when complete.
    const toolBlocks = new Map<number, { id: string; name: string; args: string }>()
    let stopReason: string | null = null

    for await (const event of stream) {
      if (opts.signal.aborted) break

      if (event.type === 'content_block_start') {
        const block = event.content_block
        if (block.type === 'tool_use') {
          toolBlocks.set(event.index, { id: block.id, name: block.name, args: '' })
        }
      } else if (event.type === 'content_block_delta') {
        const delta = event.delta
        if (delta.type === 'text_delta') {
          yield { type: 'text', delta: delta.text }
        } else if (delta.type === 'input_json_delta') {
          const tb = toolBlocks.get(event.index)
          if (tb) tb.args += delta.partial_json
        }
      } else if (event.type === 'message_delta') {
        if (event.delta.stop_reason) stopReason = event.delta.stop_reason
      }
    }

    for (const tb of toolBlocks.values()) {
      yield { type: 'tool_call', id: tb.id, name: tb.name, arguments: tb.args || '{}' }
    }

    yield {
      type: 'finish',
      reason: stopReason === 'tool_use' ? 'tool_calls' : stopReason === 'end_turn' ? 'stop' : stopReason === 'max_tokens' ? 'length' : 'other',
    }
  }
}

function toAnthropicMessage(m: NormalizedMessage): Anthropic.MessageParam {
  if (m.role === 'tool') {
    return {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: m.toolCallId!,
          content: contentToBlocks(m.content),
        },
      ],
    }
  }
  if (m.role === 'assistant') {
    const blocks: Anthropic.ContentBlockParam[] = []
    for (const p of m.content) {
      if (p.type === 'text' && p.text) blocks.push({ type: 'text', text: p.text })
    }
    if (m.toolCalls) {
      for (const tc of m.toolCalls) {
        let input: unknown = {}
        try { input = JSON.parse(tc.arguments || '{}') } catch { /* keep {} */ }
        blocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input })
      }
    }
    if (blocks.length === 0) blocks.push({ type: 'text', text: '' })
    return { role: 'assistant', content: blocks }
  }
  // user
  return { role: 'user', content: contentToBlocks(m.content) }
}

function contentToBlocks(parts: ContentPart[]): Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam> {
  const blocks: Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam> = []
  for (const p of parts) {
    if (p.type === 'text') {
      if (p.text) blocks.push({ type: 'text', text: p.text })
    } else {
      blocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: p.mimeType as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp',
          data: p.data,
        },
      })
    }
  }
  if (blocks.length === 0) blocks.push({ type: 'text', text: '' })
  return blocks
}
