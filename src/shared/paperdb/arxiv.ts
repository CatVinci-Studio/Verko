import type { PaperDraft } from '@shared/types'

// ── arXiv ─────────────────────────────────────────────────────────────────────

/**
 * Extract the arXiv ID from a full URL or return the raw ID as-is.
 * Handles forms like:
 *   https://arxiv.org/abs/2301.07041
 *   https://arxiv.org/pdf/2301.07041.pdf
 *   2301.07041
 *   arxiv:2301.07041
 */
function extractArxivId(input: string): string {
  const trimmed = input.trim()

  // Strip "arxiv:" prefix (case-insensitive)
  const prefixStripped = trimmed.replace(/^arxiv:/i, '')

  // Try to extract from a URL path
  const urlMatch = prefixStripped.match(/arxiv\.org\/(?:abs|pdf)\/([0-9]{4}\.[0-9]{4,5}(?:v\d+)?)/i)
  if (urlMatch) return urlMatch[1]

  // Bare ID pattern: YYMM.NNNNN or old-style archive/YYMMNNN
  const bareMatch = prefixStripped.match(/^([0-9]{4}\.[0-9]{4,5}(?:v\d+)?)/)
  if (bareMatch) return bareMatch[1]

  // Return trimmed as fallback and let the fetch fail with a descriptive error
  return prefixStripped
}

/**
 * Fetch paper metadata from the arXiv abs page (HTML scraping).
 */
export async function importFromArxiv(input: string): Promise<PaperDraft> {
  const id = extractArxivId(input)
  const url = `https://export.arxiv.org/abs/${id}`

  const res = await fetch(url, {
    headers: { 'User-Agent': 'Verko/0.1 (mailto:leonardoshen@icloud.com)' },
  })
  if (!res.ok) {
    throw new Error(`arXiv request failed: ${res.status} ${res.statusText}`)
  }
  const html = await res.text()

  // Parse title — inside <h1 class="title mathjax"><span class="descriptor">Title:</span> …</h1>
  const titleMatch = html.match(
    /<h1[^>]*class="title[^"]*"[^>]*>(?:<span[^>]*>[^<]*<\/span>)?\s*([\s\S]*?)<\/h1>/i
  )
  const rawTitle = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : 'Untitled'
  const title = rawTitle || 'Untitled'

  // Parse authors — inside <div class="authors"><a>…</a>, <a>…</a></div>
  const authorsBlockMatch = html.match(/<div[^>]*class="authors"[^>]*>([\s\S]*?)<\/div>/i)
  let authors: string[] = []
  if (authorsBlockMatch) {
    const links = authorsBlockMatch[1].match(/<a[^>]*>([\s\S]*?)<\/a>/gi) || []
    authors = links.map(a => a.replace(/<[^>]+>/g, '').trim()).filter(Boolean)
  }

  // Parse year from submission date — <div class="dateline">…[month year]</div>
  const datelineMatch = html.match(/<div[^>]*class="dateline"[^>]*>([\s\S]*?)<\/div>/i)
  let year: number | undefined
  if (datelineMatch) {
    const yearMatch = datelineMatch[1].match(/\b(20\d{2}|19\d{2})\b/)
    if (yearMatch) year = parseInt(yearMatch[1], 10)
  }

  return {
    title,
    authors,
    year,
    url: `https://arxiv.org/abs/${id}`,
    tags: [],
  }
}

