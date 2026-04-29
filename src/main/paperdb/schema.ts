import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
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

/**
 * Load schema.json from the library root.
 * Falls back to DEFAULT_SCHEMA if the file does not exist or is malformed.
 */
export async function loadSchema(root: string): Promise<Schema> {
  const schemaPath = join(root, 'schema.json')
  try {
    const raw = await readFile(schemaPath, 'utf-8')
    return JSON.parse(raw) as Schema
  } catch {
    return structuredClone(DEFAULT_SCHEMA)
  }
}

/** Persist schema to schema.json in the library root. */
export async function saveSchema(root: string, schema: Schema): Promise<void> {
  const schemaPath = join(root, 'schema.json')
  await writeFile(schemaPath, JSON.stringify(schema, null, 2), 'utf-8')
}
