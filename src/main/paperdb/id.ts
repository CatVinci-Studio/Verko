import { createHash, randomBytes } from 'crypto'

const STOP_WORDS = new Set(['a', 'an', 'the', 'of', 'in', 'on', 'at', 'to', 'for', 'is', 'are', 'and', 'or'])

export function generateId(draft: {
  title?: string
  authors?: string[]
  year?: number
}): string {
  const year = draft.year
  const firstAuthor = draft.authors?.[0]
  const title = draft.title

  // Authors may be "Lastname, Firstname" or "Firstname Lastname"
  // For "Lastname, Firstname" → take the part before the comma
  // For "Firstname Lastname" → take the last word
  const authorLastName = firstAuthor
    ? (firstAuthor.includes(',')
        ? firstAuthor.split(',')[0]   // "Vaswani, A." → "Vaswani"
        : firstAuthor.trim().split(/\s+/).pop()!)  // "Jonathan Ho" → "Ho"
      .trim().toLowerCase().replace(/[^a-z0-9]/g, '')
    : ''

  // First non-stop-word from title
  const titleWord = title
    ? title
        .trim()
        .split(/\s+/)
        .map(w => w.toLowerCase().replace(/[^a-z0-9]/g, ''))
        .filter(w => w.length > 0 && !STOP_WORDS.has(w))[0] ?? ''
    : ''

  if (year && authorLastName && titleWord) {
    return `${year}-${authorLastName}-${titleWord}`
  }
  if (authorLastName && titleWord) {
    return `${authorLastName}-${titleWord}`
  }

  // Fallback: 7-char hex with enough entropy to avoid collisions
  return createHash('sha256')
    .update(randomBytes(16))
    .digest('hex')
    .slice(0, 7)
}
