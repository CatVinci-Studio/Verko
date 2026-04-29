import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { Library } from '../paperdb/store'

let tmpDir: string
let lib: Library

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'library-test-'))
  lib = await Library.open(tmpDir)
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

describe('Library.open', () => {
  it('creates papers/ and attachments/ directories', async () => {
    const { readdir } = await import('fs/promises')
    const entries = await readdir(tmpDir)
    expect(entries).toContain('papers')
    expect(entries).toContain('attachments')
  })

  it('creates schema.json with defaults', async () => {
    const entries = await (await import('fs/promises')).readdir(tmpDir)
    expect(entries).toContain('schema.json')
  })
})

describe('Library CRUD', () => {
  it('add and get a paper', async () => {
    const id = await lib.add({
      title: 'Test Paper',
      authors: ['Author A', 'Author B'],
      year: 2024,
      tags: ['nlp', 'llm'],
    })
    expect(id).toBeTruthy()

    const detail = await lib.get(id)
    expect(detail.title).toBe('Test Paper')
    expect(detail.authors).toEqual(['Author A', 'Author B'])
    expect(detail.year).toBe(2024)
    expect(detail.tags).toEqual(['nlp', 'llm'])
    expect(detail.status).toBe('unread')
  })

  it('list returns added paper', async () => {
    await lib.add({ title: 'Paper 1', tags: [] })
    await lib.add({ title: 'Paper 2', tags: [] })
    const refs = await lib.list()
    expect(refs.length).toBe(2)
  })

  it('update changes fields and updates updated_at', async () => {
    const id = await lib.add({ title: 'Old Title', tags: [] })
    const before = (await lib.get(id)).updated_at

    await new Promise(r => setTimeout(r, 5))
    await lib.update(id, { title: 'New Title', status: 'read' })

    const after = await lib.get(id)
    expect(after.title).toBe('New Title')
    expect(after.status).toBe('read')
    expect(after.updated_at).not.toBe(before)
  })

  it('delete removes paper from list', async () => {
    const id = await lib.add({ title: 'To Delete', tags: [] })
    await lib.delete(id)
    const refs = await lib.list()
    expect(refs.find(r => r.id === id)).toBeUndefined()
  })

  it('appendNote adds content to section', async () => {
    const id = await lib.add({ title: 'Paper', tags: [], markdown: '## My Notes\n\nExisting.' })
    await lib.appendNote(id, 'My Notes', 'New note here.')
    const detail = await lib.get(id)
    expect(detail.markdown).toContain('New note here.')
    expect(detail.markdown).toContain('Existing.')
  })

  it('appendNote creates section if missing', async () => {
    const id = await lib.add({ title: 'Paper', tags: [] })
    await lib.appendNote(id, 'Summary', 'This is the summary.')
    const detail = await lib.get(id)
    expect(detail.markdown).toContain('## Summary')
    expect(detail.markdown).toContain('This is the summary.')
  })
})

describe('Library filtering', () => {
  beforeEach(async () => {
    await lib.add({ title: 'Read Paper', tags: ['nlp'], status: 'read', year: 2022 })
    await lib.add({ title: 'Unread Paper', tags: ['cv'], status: 'unread', year: 2023 })
    await lib.add({ title: 'Reading Paper', tags: ['nlp', 'llm'], status: 'reading', year: 2024 })
  })

  it('filters by status', async () => {
    const refs = await lib.list({ status: ['read'] })
    expect(refs.length).toBe(1)
    expect(refs[0].title).toBe('Read Paper')
  })

  it('filters by tag', async () => {
    const refs = await lib.list({ tags: ['nlp'] })
    expect(refs.every(r => r.tags.includes('nlp'))).toBe(true)
  })

  it('filters by year range', async () => {
    const refs = await lib.list({ yearFrom: 2023, yearTo: 2024 })
    expect(refs.length).toBe(2)
  })
})

describe('Library search', () => {
  it('returns hits for matching query', async () => {
    await lib.add({ title: 'Attention Transformer', authors: ['Vaswani'], tags: ['nlp'] })
    await lib.add({ title: 'Diffusion Models', authors: ['Ho'], tags: ['generative'] })
    const hits = await lib.search('transformer')
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0].paper.title).toContain('Transformer')
  })
})

describe('Library schema', () => {
  it('addColumn propagates to existing papers', async () => {
    const id = await lib.add({ title: 'Paper', tags: [] })
    await lib.addColumn({ name: 'venue_tier', type: 'select', inCsv: true, options: [{ value: 'A' }, { value: 'B' }], default: 'B' })
    const detail = await lib.get(id)
    expect(detail['venue_tier']).toBe('B')
  })

  it('removeColumn updates schema', async () => {
    await lib.addColumn({ name: 'custom_field', type: 'text', inCsv: false })
    await lib.removeColumn('custom_field')
    const schema = lib.schema()
    expect(schema.columns.find(c => c.name === 'custom_field')).toBeUndefined()
  })
})
