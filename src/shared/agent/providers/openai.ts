import OpenAI from 'openai'
import { CODEX_API_ENDPOINT } from '@shared/oauth/codex'
import type {
  CodexOAuth,
  ContentPart,
  NormalizedMessage,
  ProviderConfig,
  ProviderProtocol,
  StreamEvent,
  StreamOptions,
} from './types'

const REFRESH_LEEWAY_MS = 30_000

interface ToolCallAccum {
  id: string
  name: string
  args: string
}

export class OpenAIProtocol implements ProviderProtocol {
  private client: OpenAI

  constructor(public readonly config: ProviderConfig) {
    const oauth = config.oauth?.kind === 'codex' ? config.oauth : undefined

    this.client = new OpenAI({
      baseURL: config.baseUrl || 'https://api.openai.com/v1',
      // OAuth path: the SDK still requires *some* apiKey value at construction,
      // even with a custom fetch overriding the Authorization header. Use a
      // sentinel — the override below strips it before the request leaves.
      apiKey: oauth ? 'oauth-placeholder' : config.apiKey,
      dangerouslyAllowBrowser: typeof window !== 'undefined',
      ...(oauth ? { fetch: makeCodexFetch(oauth) } : {}),
    })
  }

  async testConnection(): Promise<boolean> {
    // Auth-only check. `chat.completions` with max_tokens:1 misfires on
    // reasoning models (gpt-5 / o-series reserve a token budget for
    // hidden reasoning, so a 1-token cap returns finish_reason="length"
    // with no choices) and burns quota. `models.list` is the canonical
    // "does the key work" probe — fast, free, no model assumed.
    //
    // OAuth path skips this — the chatgpt.com Codex endpoint doesn't
    // expose `/v1/models`, and a successful sign-in already proves the
    // token is good.
    if (this.config.oauth) return true
    try {
      await this.client.models.list()
      return true
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

    const body: OpenAI.Chat.ChatCompletionCreateParamsStreaming = {
      model: this.config.model,
      messages: oaiMessages,
      tools,
      tool_choice: tools.length > 0 ? 'auto' : undefined,
      temperature: opts.temperature,
      stream: true,
    }
    opts.onRawRequest?.(body)
    const stream = this.client.chat.completions.stream(body, { signal: opts.signal })

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
      // OpenAI accepts empty args by emitting `arguments: ""` over the
      // wire, but echoing that back on the next turn fails validation —
      // `arguments` must be a JSON string. Reasoning models (o-series,
      // gpt-5) routinely emit zero-argument tool calls. Normalise here
      // so persistence + the next turn always carry valid JSON.
      yield {
        type: 'tool_call',
        id: tc.id,
        name: tc.name,
        arguments: tc.args || '{}',
      }
    }

    yield { type: 'finish', reason: normalizeFinish(finishReason) }
  }
}

/**
 * Build a Fetch-API-compatible function that injects the Codex OAuth
 * Authorization + ChatGPT-Account-Id headers and rewrites the URL to
 * the Codex backend endpoint. Refreshes the access token on demand
 * within `REFRESH_LEEWAY_MS` of expiry. Concurrent calls in the leeway
 * window share a single in-flight refresh promise — without this guard,
 * two parallel tool calls would both POST to /oauth/token and the
 * second refresh would invalidate the first refresh_token rotation.
 */
function makeCodexFetch(oauth: CodexOAuth): typeof fetch {
  let inflightRefresh: Promise<void> | null = null

  const refreshIfNeeded = async () => {
    if (oauth.tokens.expiresAt - Date.now() >= REFRESH_LEEWAY_MS) return
    if (inflightRefresh) return inflightRefresh
    inflightRefresh = (async () => {
      try {
        const next = await oauth.refresh(oauth.tokens.refreshToken)
        // Mutate in place — the closure shares `oauth` with the caller.
        oauth.tokens.accessToken = next.accessToken
        oauth.tokens.refreshToken = next.refreshToken
        oauth.tokens.expiresAt = next.expiresAt
        if (next.accountId) oauth.tokens.accountId = next.accountId
      } finally {
        inflightRefresh = null
      }
    })()
    return inflightRefresh
  }

  return async (input, init) => {
    await refreshIfNeeded()

    const headers = new Headers(init?.headers ?? {})
    headers.delete('authorization')
    headers.set('Authorization', `Bearer ${oauth.tokens.accessToken}`)
    if (oauth.tokens.accountId) {
      headers.set('ChatGPT-Account-Id', oauth.tokens.accountId)
    }
    // Codex backend uses `originator` to identify the client. The official
    // codex CLI sends `codex_cli_rs`; opencode sends `opencode`. Without
    // this header the backend has been observed to silently reject or
    // degrade. The browser strips User-Agent overrides from fetch, so
    // `originator` is the only client-id channel we have.
    headers.set('originator', 'verko')

    const requestUrl = typeof input === 'string'
      ? input
      : input instanceof URL ? input.toString() : input.url
    const parsed = new URL(requestUrl)
    const path = parsed.pathname
    const url = path.endsWith('/chat/completions') || path.endsWith('/responses')
      ? CODEX_API_ENDPOINT
      : parsed.toString()

    return fetch(url, { ...init, headers })
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
          // Defensive: even if a persisted message slipped through with
          // empty args, OpenAI's API rejects it on replay.
          function: { name: tc.name, arguments: tc.arguments || '{}' },
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
