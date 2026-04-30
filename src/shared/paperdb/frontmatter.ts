import matter from 'gray-matter'

/**
 * Parse YAML frontmatter from a markdown string.
 * Returns the frontmatter data object and the body content below the delimiter.
 */
export function parseFrontmatter(content: string): {
  data: Record<string, unknown>
  body: string
} {
  const { data, content: body } = matter(content)
  return { data: data as Record<string, unknown>, body }
}

/**
 * Serialize frontmatter data and markdown body back into a single string.
 */
export function stringifyFrontmatter(
  data: Record<string, unknown>,
  body: string
): string {
  // gray-matter / js-yaml cannot serialize undefined — strip it out
  const clean = Object.fromEntries(
    Object.entries(data).filter(([, v]) => v !== undefined && v !== null || v === null)
  )
  return matter.stringify(body, clean)
}

/**
 * Normalize raw frontmatter data into well-typed values:
 *   - authors: comma/semicolon-separated string → string[]
 *   - tags:    "a;b" or "a,b" → string[]
 *   - year:    string → number
 */
export function normalizePaperData(
  raw: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...raw }

  // Normalize authors — split on semicolons only (commas appear inside author names)
  if (typeof out.authors === 'string') {
    out.authors = out.authors
      .split(';')
      .map((a: string) => a.trim())
      .filter(Boolean)
  } else if (!Array.isArray(out.authors)) {
    out.authors = []
  }

  // Normalize tags
  if (typeof out.tags === 'string') {
    out.tags = out.tags
      .split(/[;,]/)
      .map((t: string) => t.trim())
      .filter(Boolean)
  } else if (!Array.isArray(out.tags)) {
    out.tags = []
  }

  // Normalize year
  if (typeof out.year === 'string') {
    const parsed = parseInt(out.year, 10)
    out.year = isNaN(parsed) ? undefined : parsed
  }

  return out
}
