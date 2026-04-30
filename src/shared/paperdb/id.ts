/**
 * Paper ID generator. Browser- and Node-compatible: relies only on
 * Web Crypto APIs (`crypto.getRandomValues`, `crypto.subtle.digest`),
 * which Node 19+ exposes globally and every modern browser ships.
 */

const STOP_WORDS = new Set(['a', 'an', 'the', 'of', 'in', 'on', 'at', 'to', 'for', 'is', 'are', 'and', 'or'])

function bytesToHex(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0')
  }
  return out
}

/**
 * Generate a stable, human-readable paper ID. Falls back to a random
 * 7-char hex string when metadata is insufficient.
 *
 * Async because the fallback path uses SubtleCrypto. The deterministic
 * `{year}-{lastname}-{titleword}` path is computed eagerly without await
 * so the common case still runs in microseconds.
 */
export async function generateId(draft: {
  title?: string
  authors?: string[]
  year?: number
}): Promise<string> {
  const year = draft.year
  const firstAuthor = draft.authors?.[0]
  const title = draft.title

  const authorLastName = firstAuthor
    ? (firstAuthor.includes(',')
        ? firstAuthor.split(',')[0]
        : firstAuthor.trim().split(/\s+/).pop()!)
      .trim().toLowerCase().replace(/[^a-z0-9]/g, '')
    : ''

  const titleWord = title
    ? title
        .trim()
        .split(/\s+/)
        .map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, ''))
        .filter((w) => w.length > 0 && !STOP_WORDS.has(w))[0] ?? ''
    : ''

  if (year && authorLastName && titleWord) {
    return `${year}-${authorLastName}-${titleWord}`
  }
  if (authorLastName && titleWord) {
    return `${authorLastName}-${titleWord}`
  }

  // Fallback: SHA-256 of 16 random bytes, first 7 hex chars.
  const seed = new Uint8Array(16)
  crypto.getRandomValues(seed)
  const hashBuffer = await crypto.subtle.digest('SHA-256', seed)
  return bytesToHex(new Uint8Array(hashBuffer)).slice(0, 7)
}
