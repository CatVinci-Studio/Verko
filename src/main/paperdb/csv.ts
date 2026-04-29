import { readFile, writeFile } from 'fs/promises'
import Papa from 'papaparse'
import type { PaperRef, Schema } from '@shared/types'

/**
 * Rebuild (overwrite) the CSV file at csvPath from the current in-memory refs.
 * Only columns marked inCsv: true in the schema are written.
 * Array values are joined with ';'.
 */
export async function rebuildCsv(
  csvPath: string,
  refs: PaperRef[],
  schema: Schema
): Promise<void> {
  const csvColumns = schema.columns
    .filter(col => col.inCsv)
    .map(col => col.name)

  const rows = refs.map(ref => {
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
  await writeFile(csvPath, csv, 'utf-8')
}

/**
 * Parse a CSV file and return lightweight PaperRef objects.
 * Fields that contain ';' are split back into string arrays.
 * Numeric-looking values for known fields (year, rating) are coerced.
 */
export async function parseCsv(csvPath: string): Promise<PaperRef[]> {
  const raw = await readFile(csvPath, 'utf-8')
  const result = Papa.parse<Record<string, string>>(raw, {
    header: true,
    skipEmptyLines: true,
  })

  const ARRAY_FIELDS = new Set(['authors', 'tags'])

  return result.data.map(row => {
    const out: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(row)) {
      if (ARRAY_FIELDS.has(key)) {
        out[key] = value
          ? value.split(';').map(s => s.trim()).filter(Boolean)
          : []
      } else if (key === 'year' || key === 'rating') {
        const n = Number(value)
        out[key] = value !== '' && !isNaN(n) ? n : undefined
      } else {
        out[key] = value !== '' ? value : undefined
      }
    }

    return {
      id:         (out.id as string) || '',
      title:      (out.title as string) || '',
      authors:    (out.authors as string[]) || [],
      year:       out.year as number | undefined,
      venue:      out.venue as string | undefined,
      tags:       (out.tags as string[]) || [],
      status:     (out.status as PaperRef['status']) || 'unread',
      rating:     out.rating as number | undefined,
      added_at:   (out.added_at as string) || '',
      updated_at: (out.updated_at as string) || '',
      hasPdf:     false,
      doi:        out.doi as string | undefined,
      url:        out.url as string | undefined,
    } satisfies PaperRef
  })
}
