import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, readFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { Library } from '../store'
import { extractPage } from '../htmlExtract'
import { LocalBackend } from './helpers/backendLocal'
import { setNativeFetch } from '@shared/net/fetch'
import type { Fetcher, SimpleResponse } from '@shared/net/fetch'

let tmpDir: string
let lib: Library

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'inbox-test-'))
  const be = new LocalBackend(tmpDir)
  await be.ensureRoot()
  lib = await Library.open(be)
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

// ─── Default kind ───────────────────────────────────────────────────────────

describe('Library.add — kind defaults', () => {
  it('defaults kind to "paper" when not specified', async () => {
    const id = await lib.add({ title: 'p', tags: [] })
    const d = await lib.get(id)
    expect(d.kind).toBe('paper')
  })

  it('honors an explicit kind', async () => {
    const id = await lib.add({ title: 'a web page', kind: 'web', tags: [] })
    const d = await lib.get(id)
    expect(d.kind).toBe('web')
  })

  it('persists kind into papers.csv', async () => {
    const id = await lib.add({ title: 'web', kind: 'web', tags: [] })
    const csv = await readFile(join(tmpDir, 'papers.csv'), 'utf-8')
    expect(csv).toContain('kind')
    // The id should be in a row whose `kind` column is 'web'.
    const lines = csv.split('\n')
    const header = lines[0].split(',')
    const kindIdx = header.indexOf('kind')
    expect(kindIdx).toBeGreaterThanOrEqual(0)
    const row = lines.find((l) => l.includes(id))!
    const cells = row.split(',')
    expect(cells[kindIdx]).toBe('web')
  })
})

// ─── Legacy migration ──────────────────────────────────────────────────────

describe('Library.open — legacy v1 library migration', () => {
  it('backfills kind=paper on rows that predate the kind column', async () => {
    // Simulate a v1 library: papers.csv without the kind/summary columns,
    // schema.md missing those columns too.
    const csv = [
      'id,title,authors,year,venue,doi,url,tags,status,rating,added_at,updated_at',
      'legacy-1,Legacy Paper,Alice,2020,,,,,unread,,2020-01-01T00:00:00Z,2020-01-01T00:00:00Z',
    ].join('\n')
    await writeFile(join(tmpDir, 'papers.csv'), csv)
    await writeFile(
      join(tmpDir, 'schema.md'),
      '---\nversion: 1\ncolumns:\n  - name: id\n    type: text\n    inCsv: true\n  - name: title\n    type: text\n    inCsv: true\n  - name: status\n    type: select\n    inCsv: true\n---\n'
    )

    const be = new LocalBackend(tmpDir)
    const migrated = await Library.open(be)
    const refs = await migrated.list()
    expect(refs.length).toBe(1)
    expect(refs[0].id).toBe('legacy-1')
    expect(refs[0].kind).toBe('paper')

    // schema.md should now hold the new columns
    const schema = migrated.schema()
    expect(schema.columns.find((c) => c.name === 'kind')).toBeDefined()
    expect(schema.columns.find((c) => c.name === 'summary')).toBeDefined()
  })
})

// ─── ingestUrl ─────────────────────────────────────────────────────────────

function stubFetcher(map: Record<string, { status: number; body: string; contentType?: string }>): Fetcher {
  return async (req): Promise<SimpleResponse> => {
    const hit = map[req.url]
    if (!hit) {
      return { status: 404, ok: false, headers: {}, body: 'not found' }
    }
    return {
      status: hit.status,
      ok: hit.status >= 200 && hit.status < 300,
      headers: { 'content-type': hit.contentType ?? 'text/html; charset=utf-8' },
      body: hit.body,
    }
  }
}

describe('Library.ingestUrl', () => {
  afterEach(() => {
    // Restore the browser fetcher so other tests aren't poisoned.
    setNativeFetch(async () => ({ status: 500, ok: false, headers: {}, body: '' }))
  })

  it('creates a kind=web row with title + description from <meta>', async () => {
    setNativeFetch(stubFetcher({
      'https://example.com/post': {
        status: 200,
        body: `<!doctype html><html><head>
          <title>Example Post Title</title>
          <meta name="description" content="Crisp little summary.">
        </head><body><article>Hello world content here.</article></body></html>`,
      },
    }))

    const id = await lib.ingestUrl('https://example.com/post')
    const d = await lib.get(id)
    expect(d.kind).toBe('web')
    expect(d.url).toBe('https://example.com/post')
    expect(d.title).toBe('Example Post Title')
    expect(d.summary).toBe('Crisp little summary.')
    expect(d.status).toBe('unread')
    expect(d.markdown).toContain('https://example.com/post')
    expect(d.markdown).toContain('Hello world content here.')
  })

  it('falls back to og:title + og:description when <title>/meta description are absent', async () => {
    setNativeFetch(stubFetcher({
      'https://og.example/article': {
        status: 200,
        body: `<html><head>
          <meta property="og:title" content="Open Graph Title">
          <meta property="og:description" content="OG description text.">
        </head><body>Body excerpt.</body></html>`,
      },
    }))
    const id = await lib.ingestUrl('https://og.example/article')
    const d = await lib.get(id)
    expect(d.title).toBe('Open Graph Title')
    expect(d.summary).toBe('OG description text.')
  })

  it('rejects non-http(s) URLs', async () => {
    await expect(lib.ingestUrl('file:///etc/passwd')).rejects.toThrow(/http/)
  })
})

// ─── HTML extractor (unit-level smoke) ─────────────────────────────────────

describe('extractPage', () => {
  it('strips script/style tags from the body excerpt', () => {
    const html = `<html><head><title>x</title></head>
      <body><script>alert(1)</script><style>body{color:red}</style>visible text</body></html>`
    const out = extractPage(html, 'https://x.test')
    expect(out.bodyText).not.toContain('alert')
    expect(out.bodyText).not.toContain('color:red')
    expect(out.bodyText).toContain('visible text')
  })

  it('decodes common HTML entities in title and body', () => {
    const html = `<title>Tom &amp; Jerry</title><body>caf&eacute; &#39;quotes&#39;</body>`
    const out = extractPage(html, 'https://x.test')
    expect(out.title).toBe('Tom & Jerry')
    expect(out.bodyText).toContain("'quotes'")
  })

  it('uses URL hostname as a last-resort title', () => {
    const out = extractPage('<html><body>x</body></html>', 'https://example.com/foo')
    expect(out.title).toBe('example.com/foo')
  })
})
