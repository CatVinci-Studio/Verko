import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { loadSchema, saveSchema, reconcileSchema, DEFAULT_SCHEMA } from '../schema'
import type { Schema } from '@shared/types'
import { LocalBackend } from './helpers/backendLocal'

let tmpDir: string
let backend: LocalBackend

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'paperdb-test-'))
  backend = new LocalBackend(tmpDir)
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

describe('loadSchema', () => {
  it('returns DEFAULT_SCHEMA when schema.md missing', async () => {
    const schema = await loadSchema(backend)
    expect(schema.columns.length).toBeGreaterThan(0)
    expect(schema.columns.find(c => c.name === 'title')).toBeDefined()
    expect(schema.columns.find(c => c.name === 'status')).toBeDefined()
  })

  it('round-trips through save + load', async () => {
    const original = { ...DEFAULT_SCHEMA, version: 2 }
    await saveSchema(backend, original)
    const loaded = await loadSchema(backend)
    expect(loaded.version).toBe(2)
    expect(loaded.columns).toEqual(original.columns)
  })
})

describe('DEFAULT_SCHEMA', () => {
  it('has all required columns', () => {
    const names = DEFAULT_SCHEMA.columns.map(c => c.name)
    expect(names).toContain('title')
    expect(names).toContain('authors')
    expect(names).toContain('year')
    expect(names).toContain('tags')
    expect(names).toContain('status')
    expect(names).toContain('added_at')
    expect(names).toContain('updated_at')
  })

  it('status column has correct options', () => {
    const status = DEFAULT_SCHEMA.columns.find(c => c.name === 'status')!
    const values = status.options?.map(o => o.value) ?? []
    expect(values).toContain('unread')
    expect(values).toContain('reading')
    expect(values).toContain('read')
    expect(values).toContain('archived')
  })

  it('exposes the read-later kind column with paper as the default', () => {
    const kind = DEFAULT_SCHEMA.columns.find(c => c.name === 'kind')
    expect(kind).toBeDefined()
    expect(kind!.type).toBe('select')
    expect(kind!.default).toBe('paper')
    const values = kind!.options?.map(o => o.value) ?? []
    expect(values).toEqual(expect.arrayContaining(['paper', 'web', 'pdf', 'note', 'video']))
  })

  it('exposes a summary text column for inbox previews', () => {
    const summary = DEFAULT_SCHEMA.columns.find(c => c.name === 'summary')
    expect(summary).toBeDefined()
    expect(summary!.type).toBe('text')
    expect(summary!.inCsv).toBe(true)
  })
})

describe('reconcileSchema', () => {
  it('reports no change when the schema already has every default column', () => {
    const { changed } = reconcileSchema(structuredClone(DEFAULT_SCHEMA))
    expect(changed).toBe(false)
  })

  it('adds new built-in columns to a legacy schema', () => {
    const legacy: Schema = {
      version: 1,
      columns: DEFAULT_SCHEMA.columns.filter(c => c.name !== 'kind' && c.name !== 'summary'),
    }
    const { schema, changed } = reconcileSchema(legacy)
    expect(changed).toBe(true)
    expect(schema.columns.find(c => c.name === 'kind')).toBeDefined()
    expect(schema.columns.find(c => c.name === 'summary')).toBeDefined()
    expect(schema.version).toBeGreaterThanOrEqual(DEFAULT_SCHEMA.version)
  })

  it('preserves user-added custom columns', () => {
    const legacy: Schema = {
      version: 1,
      columns: [
        ...DEFAULT_SCHEMA.columns.filter(c => c.name !== 'kind' && c.name !== 'summary'),
        { name: 'my_custom', type: 'text', inCsv: true },
      ],
    }
    const { schema } = reconcileSchema(legacy)
    expect(schema.columns.find(c => c.name === 'my_custom')).toBeDefined()
  })
})
