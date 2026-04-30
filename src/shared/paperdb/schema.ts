import matter from 'gray-matter'
import type { Schema, Column } from '@shared/types'
import type { StorageBackend } from './backend'

export const SCHEMA_REL = 'schema.md'

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

/** Load `schema.md` from the backend, or DEFAULT_SCHEMA if missing. */
export async function loadSchema(backend: StorageBackend): Promise<Schema> {
  if (!(await backend.exists(SCHEMA_REL))) return structuredClone(DEFAULT_SCHEMA)
  try {
    const raw = new TextDecoder('utf-8').decode(await backend.readFile(SCHEMA_REL))
    const { data } = matter(raw)
    return data as Schema
  } catch {
    return structuredClone(DEFAULT_SCHEMA)
  }
}

/** Persist schema as `schema.md` (YAML frontmatter + notes body). */
export async function saveSchema(backend: StorageBackend, schema: Schema): Promise<void> {
  const md = matter.stringify(SCHEMA_BODY, schema as unknown as Record<string, unknown>)
  await backend.writeFile(SCHEMA_REL, md)
}
