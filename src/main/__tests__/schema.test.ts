import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { loadSchema, saveSchema, DEFAULT_SCHEMA } from '../paperdb/schema'
import { LocalBackend } from '../paperdb/backendLocal'

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
})
