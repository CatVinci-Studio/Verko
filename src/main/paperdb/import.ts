import type { PaperDraft } from '@shared/types'

// ── CrossRef (DOI) ────────────────────────────────────────────────────────────

interface CrossRefWork {
  title?: string[]
  author?: Array<{ family?: string; given?: string }>
  'published-print'?: { 'date-parts'?: number[][] }
  'published-online'?: { 'date-parts'?: number[][] }
  'container-title'?: string[]
  DOI?: string
  URL?: string
}

interface CrossRefResponse {
  message?: CrossRefWork
}

/**
 * Fetch paper metadata from the CrossRef API using a DOI.
 */
export async function importFromDoi(doi: string): Promise<PaperDraft> {
  const url = `https://api.crossref.org/works/${encodeURIComponent(doi)}`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'PaperWithAgent/0.1 (mailto:leonardoshen@icloud.com)' },
  })
  if (!res.ok) {
    throw new Error(`CrossRef request failed: ${res.status} ${res.statusText}`)
  }
  const json = (await res.json()) as CrossRefResponse
  const work = json.message

  if (!work) throw new Error('CrossRef returned empty message')

  const title = work.title?.[0] || 'Untitled'

  const authors = (work.author || []).map(a => {
    const parts = [a.given, a.family].filter(Boolean)
    return parts.join(' ')
  })

  const dateParts =
    work['published-print']?.['date-parts']?.[0] ??
    work['published-online']?.['date-parts']?.[0]
  const year = dateParts?.[0]

  const venue = work['container-title']?.[0]

  return {
    title,
    authors,
    year,
    venue,
    doi: work.DOI || doi,
    url: work.URL,
    tags: [],
  }
}

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
    headers: { 'User-Agent': 'PaperWithAgent/0.1 (mailto:leonardoshen@icloud.com)' },
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

// ── Generic URL importer ──────────────────────────────────────────────────────

/**
 * Minimal importer for arbitrary URLs — fetches the page and uses the
 * <title> element as the paper title.
 */
async function importFromUrl(url: string): Promise<PaperDraft> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'PaperWithAgent/0.1 (mailto:leonardoshen@icloud.com)' },
  })
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`)
  const html = await res.text()
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const title = titleMatch
    ? titleMatch[1].replace(/<[^>]+>/g, '').trim()
    : url
  return { title, url, tags: [] }
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

/**
 * Detect the type of input (DOI, arXiv URL/ID, or generic URL) and dispatch
 * to the appropriate importer.
 */
export async function detectAndImport(input: string): Promise<PaperDraft> {
  const trimmed = input.trim()

  // arXiv URL or bare arXiv ID
  if (
    /arxiv\.org/i.test(trimmed) ||
    /^arxiv:/i.test(trimmed) ||
    /^[0-9]{4}\.[0-9]{4,5}(v\d+)?$/.test(trimmed)
  ) {
    return importFromArxiv(trimmed)
  }

  // DOI: starts with "10." or "doi:" prefix or https://doi.org/…
  if (
    /^10\.\d{4,}\//.test(trimmed) ||
    /^doi:/i.test(trimmed) ||
    /^https?:\/\/doi\.org\//i.test(trimmed)
  ) {
    const doi = trimmed
      .replace(/^doi:/i, '')
      .replace(/^https?:\/\/doi\.org\//i, '')
      .trim()
    return importFromDoi(doi)
  }

  // Generic URL
  if (/^https?:\/\//i.test(trimmed)) {
    return importFromUrl(trimmed)
  }

  // Last resort: try as DOI
  return importFromDoi(trimmed)
}
