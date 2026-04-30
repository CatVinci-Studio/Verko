import type { ToolRegistry } from './types'

/**
 * web_fetch — browser-safe network tool. Returns the response body as
 * text (HTML / JSON / plain). Markdown conversion was a desktop-only
 * convenience (Turndown); we keep it simple here and let the model
 * pick out content from the raw text.
 */
export const webTools: ToolRegistry = {
  web_fetch: {
    def: {
      name: 'web_fetch',
      description:
        'Fetch a URL and return its body as text. Useful for following links from a paper.',
      parameters: {
        type: 'object',
        properties: { url: { type: 'string', description: 'Absolute http(s) URL.' } },
        required: ['url'],
      },
    },
    async call(args) {
      const url = String(args['url'] ?? '')
      if (!/^https?:\/\//i.test(url)) {
        return JSON.stringify({ error: 'URL must start with http:// or https://' })
      }
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Verko/0.3 (mailto:leonardoshen@icloud.com)' },
        })
        if (!res.ok) {
          return JSON.stringify({ error: `Fetch failed: ${res.status} ${res.statusText}` })
        }
        const ct = res.headers.get('content-type') ?? ''
        const text = await res.text()
        return JSON.stringify({ url, contentType: ct, body: text.slice(0, 50_000) })
      } catch (e) {
        return JSON.stringify({ error: e instanceof Error ? e.message : String(e) })
      }
    },
  },
}
