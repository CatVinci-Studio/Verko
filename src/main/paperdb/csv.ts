import Papa from 'papaparse'
import type { PaperRef, Schema } from '@shared/types'
import type { StorageBackend } from './backend'

/**
 * Rebuild (overwrite) the CSV file at `relPath` from the current refs.
 * Only columns marked `inCsv: true` in the schema are written.
 * Array values are joined with `;`.
 */
export async function rebuildCsv(
  backend: StorageBackend,
  relPath: string,
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
  await backend.writeFile(relPath, csv)
}
