import Papa from 'papaparse'
import type { PaperRef, Schema, ColumnType } from '@shared/types'
import type { StorageBackend } from './backend'

const decoder = new TextDecoder('utf-8')

/**
 * CSV is the canonical store for paper field data. Markdown files at
 * `papers/<id>.md` hold only the notes body — they have no frontmatter.
 *
 * `rebuildCsv` serializes the in-memory refs back out; `parseCsv` is the
 * inverse, run on Library init.
 */

export async function rebuildCsv(
  backend: StorageBackend,
  relPath: string,
  refs: PaperRef[],
  schema: Schema
): Promise<void> {
  const csvColumns = schema.columns
    .filter((col) => col.inCsv)
    .map((col) => col.name)

  const rows = refs.map((ref) => {
    const row: Record<string, string> = {}
    for (const col of csvColumns) {
      const val = (ref as Record<string, unknown>)[col]
      if (Array.isArray(val)) {
        row[col] = val.join(';')
      } else if (val == null) {
        row[col] = ''
      } else {
        row[col] = String(val)
      }
    }
    return row
  })

  const csv = Papa.unparse(rows, { columns: csvColumns })
  await backend.writeFile(relPath, csv)
}

/**
 * Parse a CSV file into PaperRefs, using `schema` to coerce types.
 * Unknown columns are kept as strings (custom user-added columns survive
 * round-trip even if their schema disagrees).
 */
export async function parseCsv(
  backend: StorageBackend,
  relPath: string,
  schema: Schema
): Promise<PaperRef[]> {
  let text: string
  try {
    text = decoder.decode(await backend.readFile(relPath))
  } catch {
    return []
  }
  if (!text.trim()) return []

  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  })

  const colTypes = new Map<string, ColumnType>(
    schema.columns.map((c) => [c.name, c.type])
  )

  const refs: PaperRef[] = []
  for (const row of parsed.data) {
    if (!row || typeof row !== 'object') continue
    const ref = rowToRef(row, colTypes)
    if (!ref) continue
    refs.push(ref)
  }
  return refs
}

function rowToRef(
  row: Record<string, string>,
  colTypes: Map<string, ColumnType>
): PaperRef | null {
  const id = (row['id'] ?? '').trim()
  if (!id) return null

  const out: Record<string, unknown> = { id }
  for (const [key, raw] of Object.entries(row)) {
    if (key === 'id') continue
    out[key] = parseValue(raw ?? '', colTypes.get(key))
  }

  const now = new Date().toISOString()
  return {
    id,
    title:      (out['title'] as string) || id,
    authors:    asStringArray(out['authors']),
    year:       out['year'] as number | undefined,
    venue:      (out['venue'] as string | undefined) || undefined,
    doi:        (out['doi']   as string | undefined) || undefined,
    url:        (out['url']   as string | undefined) || undefined,
    tags:       asStringArray(out['tags']),
    status:     (out['status'] as PaperRef['status']) || 'unread',
    rating:     out['rating'] as number | undefined,
    added_at:   (out['added_at']   as string) || now,
    updated_at: (out['updated_at'] as string) || now,
    hasPdf:     false,  // populated separately from attachments listing
    ...(extractExtras(out)),
  }
}

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string')
  return []
}

function extractExtras(out: Record<string, unknown>): Record<string, unknown> {
  const known = new Set([
    'id', 'title', 'authors', 'year', 'venue', 'doi', 'url',
    'tags', 'status', 'rating', 'added_at', 'updated_at',
  ])
  return Object.fromEntries(Object.entries(out).filter(([k]) => !known.has(k)))
}

function parseValue(raw: string, type: ColumnType | undefined): unknown {
  const s = raw.trim()
  if (s === '') return undefined
  switch (type) {
    case 'tags':
    case 'multiselect':
      return s.split(';').map((t) => t.trim()).filter(Boolean)
    case 'number': {
      const n = Number(s)
      return Number.isFinite(n) ? n : undefined
    }
    case 'bool':
      return s === 'true' || s === '1'
    case 'date':
    case 'text':
    case 'url':
    case 'select':
    case 'link':
    default:
      return s
  }
}
