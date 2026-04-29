import { readFile, writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import matter from 'gray-matter'
import type { Schema, Column } from '@shared/types'

export const DEFAULT_SCHEMA: Schema = {
  version: 1,
  columns: [
    { name: 'id',         type: 'text',   inCsv: true  },
    { name: 'title',      type: 'text',   inCsv: true  },
    { name: 'authors',    type: 'tags',   inCsv: true  },
    { name: 'year',       type: 'number', inCsv: true  },
    { name: 'venue',      type: 'text',   inCsv: true  },
    { name: 'doi',        type: 'url',    inCsv: true  },
    { name: 'url',        type: 'url',    inCsv: true  },
    { name: 'pdf',        type: 'text',   inCsv: false },
    { name: 'tags',       type: 'tags',   inCsv: true  },
    {
      name: 'status',
      type: 'select',
      inCsv: true,
      options: [
        { value: 'unread'   },
        { value: 'reading'  },
        { value: 'read'     },
        { value: 'archived' },
      ],
    },
    { name: 'rating',     type: 'number', inCsv: true  },
    { name: 'added_at',   type: 'date',   inCsv: true  },
    { name: 'updated_at', type: 'date',   inCsv: true  },
  ] satisfies Column[],
}

const SCHEMA_BODY = `# Schema

Column definitions for this library. The frontmatter above describes
the shape every paper's YAML header is expected to follow:

- \`columns[].name\`  — frontmatter key
- \`columns[].type\`  — text / number / date / bool / select / multiselect / tags / url
- \`columns[].inCsv\` — whether this column is projected into \`papers.csv\`

Use this body to leave notes on why specific columns exist; it isn't
parsed.
`

const MD_PATH = (root: string) => join(root, 'schema.md')
const LEGACY_JSON_PATH = (root: string) => join(root, 'schema.json')

/**
 * Load the schema for a library.
 *
 * Resolution order:
 *   1. `schema.md`    — current format (YAML frontmatter + markdown notes)
 *   2. `schema.json`  — legacy format from earlier versions
 *   3. DEFAULT_SCHEMA — fresh / unrecognized libraries
 *
 * On a successful legacy fallback, the schema is rewritten as `.md`
 * (and the old `.json` removed) by the next `saveSchema` call.
 */
export async function loadSchema(root: string): Promise<Schema> {
  // 1. schema.md
  try {
    const raw = await readFile(MD_PATH(root), 'utf-8')
    const parsed = matter(raw)
    return parsed.data as Schema
  } catch { /* fallthrough */ }

  // 2. legacy schema.json
  try {
    const raw = await readFile(LEGACY_JSON_PATH(root), 'utf-8')
    return JSON.parse(raw) as Schema
  } catch { /* fallthrough */ }

  // 3. default
  return structuredClone(DEFAULT_SCHEMA)
}

/**
 * Persist schema as `schema.md`. If a legacy `schema.json` is present,
 * remove it after the new file is written so libraries gradually settle
 * on a single source of truth.
 */
export async function saveSchema(root: string, schema: Schema): Promise<void> {
  const md = matter.stringify(SCHEMA_BODY, schema as unknown as Record<string, unknown>)
  await writeFile(MD_PATH(root), md, 'utf-8')
  // Best-effort legacy cleanup; missing-file is fine.
  try {
    await unlink(LEGACY_JSON_PATH(root))
  } catch { /* not present, no-op */ }
}
