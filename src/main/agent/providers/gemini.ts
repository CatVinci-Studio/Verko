import { GoogleGenAI, Type } from '@google/genai'
import type {
  ContentPart,
  NormalizedMessage,
  ProviderConfig,
  ProviderProtocol,
  StreamEvent,
  StreamOptions,
} from './types'

export class GeminiProtocol implements ProviderProtocol {
  private client: GoogleGenAI

  constructor(public readonly config: ProviderConfig) {
    this.client = new GoogleGenAI({ apiKey: config.apiKey })
  }

  async testConnection(): Promise<boolean> {
    try {
      const res = await this.client.models.generateContent({
        model: this.config.model,
        contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
        config: { maxOutputTokens: 1 },
      })
      return !!res.text
    } catch {
      return false
    }
  }

  async *stream(opts: StreamOptions): AsyncIterable<StreamEvent> {
    const contents = opts.messages.map(toGeminiContent)
    const tools = opts.tools.length > 0
      ? [{
          functionDeclarations: opts.tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: jsonSchemaToGemini(t.parameters),
          })),
        }]
      : undefined

    const stream = await this.client.models.generateContentStream({
      model: this.config.model,
      contents,
      config: {
        systemInstruction: opts.systemPrompt,
        temperature: opts.temperature,
        tools,
        abortSignal: opts.signal,
      },
    })

    let finishReason: string | undefined
    const toolCalls: Array<{ id: string; name: string; args: string }> = []

    for await (const chunk of stream) {
      if (opts.signal.aborted) break
      const cand = chunk.candidates?.[0]
      if (!cand) continue
      for (const part of cand.content?.parts ?? []) {
        if (part.text) yield { type: 'text', delta: part.text }
        if (part.functionCall) {
          toolCalls.push({
            id: part.functionCall.id ?? `call_${toolCalls.length}`,
            name: part.functionCall.name ?? '',
            args: JSON.stringify(part.functionCall.args ?? {}),
          })
        }
      }
      if (cand.finishReason) finishReason = cand.finishReason
    }

    for (const tc of toolCalls) {
      yield { type: 'tool_call', id: tc.id, name: tc.name, arguments: tc.args }
    }

    const reason: 'stop' | 'tool_calls' | 'length' | 'other' =
      toolCalls.length > 0 ? 'tool_calls'
      : finishReason === 'STOP' ? 'stop'
      : finishReason === 'MAX_TOKENS' ? 'length'
      : 'other'
    yield { type: 'finish', reason }
  }
}

function toGeminiContent(m: NormalizedMessage): { role: 'user' | 'model'; parts: Array<Record<string, unknown>> } {
  if (m.role === 'tool') {
    return {
      role: 'user',
      parts: [{
        functionResponse: {
          id: m.toolCallId,
          name: m.toolName ?? 'tool',
          response: { result: contentToText(m.content) },
        },
      }],
    }
  }
  const role = m.role === 'assistant' ? 'model' : 'user'
  const parts: Array<Record<string, unknown>> = []
  for (const p of m.content) {
    if (p.type === 'text') {
      if (p.text) parts.push({ text: p.text })
    } else {
      parts.push({ inlineData: { mimeType: p.mimeType, data: p.data } })
    }
  }
  if (m.toolCalls) {
    for (const tc of m.toolCalls) {
      let args: unknown = {}
      try { args = JSON.parse(tc.arguments || '{}') } catch { /* {} */ }
      parts.push({ functionCall: { id: tc.id, name: tc.name, args } })
    }
  }
  if (parts.length === 0) parts.push({ text: '' })
  return { role, parts }
}

function contentToText(parts: ContentPart[]): string {
  return parts.filter((p): p is { type: 'text'; text: string } => p.type === 'text').map((p) => p.text).join('')
}

/**
 * Gemini's parameter schema is JSON-Schema-like but uses an enum-typed
 * `type` field (`Type.OBJECT` etc.) and rejects extra keys. Strip and
 * remap conservatively.
 */
function jsonSchemaToGemini(schema: Record<string, unknown>): Record<string, unknown> {
  const t = schema.type as string | undefined
  const out: Record<string, unknown> = {}
  if (t === 'object') out.type = Type.OBJECT
  else if (t === 'string') out.type = Type.STRING
  else if (t === 'number' || t === 'integer') out.type = Type.NUMBER
  else if (t === 'boolean') out.type = Type.BOOLEAN
  else if (t === 'array') out.type = Type.ARRAY
  if (schema.description) out.description = schema.description
  if (schema.enum) out.enum = schema.enum
  if (schema.properties) {
    const props = schema.properties as Record<string, Record<string, unknown>>
    out.properties = Object.fromEntries(
      Object.entries(props).map(([k, v]) => [k, jsonSchemaToGemini(v)])
    )
  }
  if (schema.required) out.required = schema.required
  if (schema.items) out.items = jsonSchemaToGemini(schema.items as Record<string, unknown>)
  return out
}
