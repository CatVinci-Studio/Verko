/**
 * Browser-safe HTML extraction. Pulls a title, a description (og/meta),
 * and a cleaned-up plain-text excerpt from raw HTML. No deps so this
 * runs in shared code (Node tests + webview) without a build hop.
 *
 * Not as good as Mozilla Readability — replaceable later without
 * changing callers (the shape of `ExtractedPage` is the contract).
 */

const RE_TITLE = /<title[^>]*>([\s\S]*?)<\/title>/i
const RE_META = /<meta\b[^>]*>/gi
const RE_SCRIPT_STYLE = /<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi
const RE_TAGS = /<[^>]+>/g

const ENTITIES: Record<string, string> = {
  '&amp;':  '&',
  '&lt;':   '<',
  '&gt;':   '>',
  '&quot;': '"',
  '&apos;': "'",
  '&#39;':  "'",
  '&nbsp;': ' ',
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&[a-zA-Z]+;|&#39;/g, (m) => ENTITIES[m] ?? m)
}

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i'))
  return m ? m[1] : null
}

export interface ExtractedPage {
  /** Best-effort title — `<title>`, falls back to og:title, then hostname/path. */
  title: string
  /** Meta description / og:description / twitter:description. Empty if none. */
  description: string
  /** Cleaned plain-text excerpt of the body, capped (caller chooses the budget). */
  bodyText: string
}

export function extractPage(html: string, fallbackUrl: string, maxBodyChars = 8000): ExtractedPage {
  let title = ''
  const t = html.match(RE_TITLE)
  if (t) title = decodeEntities(t[1]).trim()

  let description = ''
  let ogTitle = ''
  const metas = html.match(RE_META) ?? []
  for (const tag of metas) {
    const key = (attr(tag, 'name') || attr(tag, 'property') || '').toLowerCase()
    const content = attr(tag, 'content')
    if (!content) continue
    if (
      !description &&
      (key === 'description' || key === 'og:description' || key === 'twitter:description')
    ) {
      description = decodeEntities(content).trim()
    } else if (!ogTitle && (key === 'og:title' || key === 'twitter:title')) {
      ogTitle = decodeEntities(content).trim()
    }
  }
  if (!title) title = ogTitle
  if (!title) {
    try {
      const u = new URL(fallbackUrl)
      title = u.hostname + u.pathname
    } catch {
      title = fallbackUrl
    }
  }

  const bodyText = decodeEntities(
    html.replace(RE_SCRIPT_STYLE, ' ').replace(RE_TAGS, ' ')
  ).replace(/\s+/g, ' ').trim().slice(0, maxBodyChars)

  return { title, description, bodyText }
}
