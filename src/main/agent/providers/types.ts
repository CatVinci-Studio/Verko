/**
 * Provider-neutral message + streaming protocol. All adapters
 * (`openai.ts`, `anthropic.ts`, `gemini.ts`) translate this to / from
 * their vendor-specific shapes so the rest of the agent code never
 * touches an SDK directly.
 */

export type Role = 'user' | 'assistant' | 'tool'

/** A single content fragment in a message — text, image, or document attachment. */
export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string } // base64 (no data: prefix)

/** A function call the model wants to make. */
export interface ToolCall {
  id: string
  name: string
  arguments: string  // raw JSON string from the model
}

/** A normalized message entry used internally and persisted to disk. */
export interface NormalizedMessage {
  role: Role
  content: ContentPart[]
  /** Present when role === 'assistant' and the model emitted tool calls. */
  toolCalls?: ToolCall[]
  /** Present when role === 'tool' — refers to the assistant tool_call.id this fulfills. */
  toolCallId?: string
  /** Display name of the tool, when role === 'tool'. */
  toolName?: string
}

/** JSON-schema-shaped tool definition. All three providers accept this. */
export interface ToolDef {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface StreamOptions {
  model: string
  systemPrompt: string
  messages: NormalizedMessage[]
  tools: ToolDef[]
  temperature: number
  signal: AbortSignal
}

/** Events emitted while a single LLM turn streams. */
export type StreamEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool_call'; id: string; name: string; arguments: string }
  | { type: 'finish'; reason: 'stop' | 'tool_calls' | 'length' | 'other' }

export interface ProviderProtocol {
  /** Stream a single turn. Yields normalized events; throws on transport / auth errors. */
  stream(opts: StreamOptions): AsyncIterable<StreamEvent>

  /** Quick health probe (one short request). Returns true on 200. */
  testConnection(): Promise<boolean>
}

export type ProtocolKind = 'openai' | 'anthropic' | 'gemini'

export interface ProviderConfig {
  protocol: ProtocolKind
  baseUrl?: string
  apiKey: string
  model: string
}
