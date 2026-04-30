import { copyFile } from 'fs/promises'
import { basename } from 'path'
import MiniSearch from 'minisearch'
import type {
  PaperRef,
  PaperDetail,
  PaperDraft,
  PaperPatch,
  PaperId,
  Schema,
  Column,
  Filter,
  SearchHit,
  CollectionInfo,
} from '@shared/types'
import type { StorageBackend } from '@shared/paperdb/backend'
import { loadSchema, saveSchema } from '@shared/paperdb/schema'
import { parseFrontmatter, stringifyFrontmatter, normalizePaperData } from '@shared/paperdb/frontmatter'
import { rebuildCsv } from '@shared/paperdb/csv'
import { buildIndex, searchIndex } from '@shared/paperdb/search'
import { generateId } from '@shared/paperdb/id'
import { detectAndImport } from '@shared/paperdb/import'

const PAPERS_DIR    = 'papers'
const ATTACH_DIR    = 'attachments'
const CSV_REL       = 'papers.csv'
const COLLECTIONS_REL = 'collections.json'

const paperRel    = (id: PaperId) => `${PAPERS_DIR}/${id}.md`
const attachRel   = (id: PaperId) => `${ATTACH_DIR}/${id}.pdf`
const collectionCsvRel = (name: string) => `${name}.csv`

const decoder = new TextDecoder('utf-8')
const decode = (bytes: Uint8Array): string => decoder.decode(bytes)

/**
 * In-memory paper library backed by a `StorageBackend` (filesystem, S3, …).
 *
 * The on-disk/object-store layout is the source of truth: one `.md` file per
 * paper under `papers/`, plus `schema.md` and `collections.json` for metadata.
 * The CSV index at `papers.csv` is a derived projection rebuilt on every write.
 *
 * Construct with `Library.open(backend)` — the constructor is private because
 * initialization is async (cache build).
 */
export class Library {
  readonly backend: StorageBackend
  private _schema!: Schema
  private refs = new Map<PaperId, PaperRef>()
  private hasPdfCache = new Set<PaperId>()
  private index!: MiniSearch
  private _collections = new Map<string, Set<PaperId>>()

  private constructor(backend: StorageBackend) {
    this.backend = backend
  }

  /** Open (or initialize) a library on the given backend. Idempotent. */
  static async open(backend: StorageBackend): Promise<Library> {
    const lib = new Library(backend)
    await lib._init()
    return lib
  }

  private async _init(): Promise<void> {
    this._schema = await loadSchema(this.backend)
    await saveSchema(this.backend, this._schema)
    await this._loadCollections()
    await this._rebuildCache()
  }

  // ── Collections persistence ──────────────────────────────────────────────────

  private async _loadCollections(): Promise<void> {
    try {
      if (!(await this.backend.exists(COLLECTIONS_REL))) {
        this._collections = new Map()
        return
      }
      const raw = decode(await this.backend.readFile(COLLECTIONS_REL))
      const data = JSON.parse(raw) as Record<string, string[]>
      this._collections = new Map(
        Object.entries(data).map(([name, ids]) => [name, new Set(ids)])
      )
    } catch {
      this._collections = new Map()
    }
  }

  private async _saveCollections(): Promise<void> {
    const data: Record<string, string[]> = {}
    for (const [name, ids] of this._collections) {
      data[name] = Array.from(ids)
    }
    await this.backend.writeFile(COLLECTIONS_REL, JSON.stringify(data, null, 2))
  }

  private async _rebuildCollectionCsv(name: string): Promise<void> {
    const ids = this._collections.get(name)
    if (!ids) return
    const refs = Array.from(ids).map(id => this.refs.get(id)).filter((r): r is PaperRef => r != null)
    await rebuildCsv(this.backend, collectionCsvRel(name), refs, this._schema)
  }

  private async _rebuildCache(): Promise<void> {
    this.refs.clear()
    this.hasPdfCache.clear()

    // Pre-load attachment list once so each ref doesn't have to round-trip.
    const attachFiles = await this.backend.listFiles(ATTACH_DIR)
    for (const rel of attachFiles) {
      const name = rel.split('/').pop() ?? ''
      if (name.endsWith('.pdf')) this.hasPdfCache.add(name.slice(0, -'.pdf'.length))
    }

    const allFiles = await this.backend.listFiles(PAPERS_DIR)
    const indexDocs: Array<{
      id: string
      title: string
      authors: string
      tags: string
      body: string
    }> = []

    for (const rel of allFiles) {
      if (!rel.endsWith('.md')) continue
      const file = rel.slice(`${PAPERS_DIR}/`.length)
      try {
        const id = basename(file, '.md')
        const content = decode(await this.backend.readFile(rel))
        const { data, body } = parseFrontmatter(content)
        const norm = normalizePaperData(data)
        const ref = this._toRef(id, norm, body)
        this.refs.set(id, ref)
        indexDocs.push({
          id,
          title: ref.title,
          authors: ref.authors.join(' '),
          tags: ref.tags.join(' '),
          body: body.slice(0, 2000),
        })
      } catch {
        // skip malformed files
      }
    }

    this.index = buildIndex(indexDocs)

    if (!(await this.backend.exists(CSV_REL))) {
      await this._writeCsv()
    }
  }

  private _toRef(
    id: PaperId,
    data: Record<string, unknown>,
    _body: string
  ): PaperRef {
    return {
      id,
      title:      (data.title as string) || id,
      authors:    (data.authors as string[]) || [],
      year:       data.year as number | undefined,
      venue:      data.venue as string | undefined,
      tags:       (data.tags as string[]) || [],
      status:     (data.status as PaperRef['status']) || 'unread',
      rating:     data.rating as number | undefined,
      added_at:   (data.added_at as string) || new Date().toISOString(),
      updated_at: (data.updated_at as string) || new Date().toISOString(),
      hasPdf:     this.hasPdfCache.has(id),
      doi:        data.doi as string | undefined,
      url:        data.url as string | undefined,
    }
  }

  private async _writeCsv(): Promise<void> {
    await rebuildCsv(this.backend, CSV_REL, Array.from(this.refs.values()), this._schema)
  }

  // ── Collections ─────────────────────────────────────────────────────────────

  listCollections(): CollectionInfo[] {
    return Array.from(this._collections.entries()).map(([name, ids]) => ({
      name,
      paperCount: ids.size,
    }))
  }

  async createCollection(name: string): Promise<void> {
    if (this._collections.has(name)) return
    this._collections.set(name, new Set())
    await this._saveCollections()
    await rebuildCsv(this.backend, collectionCsvRel(name), [], this._schema)
  }

  async deleteCollection(name: string): Promise<void> {
    this._collections.delete(name)
    await this._saveCollections()
    await this.backend.deleteFile(collectionCsvRel(name))
  }

  async renameCollection(oldName: string, newName: string): Promise<void> {
    const ids = this._collections.get(oldName)
    if (!ids) return
    this._collections.delete(oldName)
    this._collections.set(newName, ids)
    await this._saveCollections()
    await this.backend.deleteFile(collectionCsvRel(oldName))
    await this._rebuildCollectionCsv(newName)
  }

  async addToCollection(id: PaperId, name: string): Promise<void> {
    if (!this._collections.has(name)) this._collections.set(name, new Set())
    this._collections.get(name)!.add(id)
    await this._saveCollections()
    await this._rebuildCollectionCsv(name)
  }

  async removeFromCollection(id: PaperId, name: string): Promise<void> {
    this._collections.get(name)?.delete(id)
    await this._saveCollections()
    await this._rebuildCollectionCsv(name)
  }

  // ── Schema ──────────────────────────────────────────────────────────────────

  schema(): Schema {
    return this._schema
  }

  async addColumn(col: Column): Promise<void> {
    this._schema.columns.push(col)
    await saveSchema(this.backend, this._schema)

    for (const [id] of this.refs) {
      const rel = paperRel(id)
      const content = decode(await this.backend.readFile(rel))
      const { data, body } = parseFrontmatter(content)
      if (!(col.name in data)) {
        data[col.name] = col.default ?? null
        await this.backend.writeFile(rel, stringifyFrontmatter(data, body))
      }
    }

    await this._writeCsv()
  }

  async removeColumn(name: string): Promise<void> {
    this._schema.columns = this._schema.columns.filter(c => c.name !== name)
    await saveSchema(this.backend, this._schema)
    await this._writeCsv()
  }

  async renameColumn(from: string, to: string): Promise<void> {
    const col = this._schema.columns.find(c => c.name === from)
    if (col) col.name = to
    await saveSchema(this.backend, this._schema)

    for (const [id] of this.refs) {
      const rel = paperRel(id)
      const content = decode(await this.backend.readFile(rel))
      const { data, body } = parseFrontmatter(content)
      if (from in data) {
        data[to] = data[from]
        delete data[from]
      }
      await this.backend.writeFile(rel, stringifyFrontmatter(data, body))
    }

    await this._rebuildCache()
  }

  // ── Papers ───────────────────────────────────────────────────────────────────

  async list(filter?: Filter, collection?: string): Promise<PaperRef[]> {
    let refs: PaperRef[]
    if (collection) {
      const ids = this._collections.get(collection) ?? new Set()
      refs = Array.from(ids).map(id => this.refs.get(id)).filter((r): r is PaperRef => r != null)
    } else {
      refs = Array.from(this.refs.values())
    }
    if (!filter) return refs

    if (filter.query) {
      const ids = new Set(searchIndex(this.index, filter.query))
      refs = refs.filter(r => ids.has(r.id))
    }
    if (filter.status?.length) {
      refs = refs.filter(r => filter.status!.includes(r.status))
    }
    if (filter.tags?.length) {
      refs = refs.filter(r => filter.tags!.some(t => r.tags.includes(t)))
    }
    if (filter.yearFrom != null) {
      refs = refs.filter(r => r.year != null && r.year >= filter.yearFrom!)
    }
    if (filter.yearTo != null) {
      refs = refs.filter(r => r.year != null && r.year <= filter.yearTo!)
    }

    return refs
  }

  async get(id: PaperId): Promise<PaperDetail> {
    const content = decode(await this.backend.readFile(paperRel(id)))
    const { data, body } = parseFrontmatter(content)
    const norm = normalizePaperData(data)
    const ref = this._toRef(id, norm, body)
    return { ...norm, ...ref, markdown: body }
  }

  async add(draft: PaperDraft): Promise<PaperId> {
    const id = await generateId(draft)
    const now = new Date().toISOString()

    const knownKeys = new Set([
      'title', 'authors', 'year', 'venue', 'doi', 'url',
      'tags', 'status', 'rating', 'markdown',
    ])
    const extras = Object.fromEntries(
      Object.entries(draft).filter(([k]) => !knownKeys.has(k))
    )

    const data: Record<string, unknown> = {
      id,
      title:      draft.title || 'Untitled',
      authors:    draft.authors || [],
      year:       draft.year,
      venue:      draft.venue,
      doi:        draft.doi,
      url:        draft.url,
      tags:       draft.tags || [],
      status:     draft.status || 'unread',
      rating:     draft.rating ?? null,
      added_at:   now,
      updated_at: now,
      ...extras,
    }

    const markdown =
      draft.markdown ||
      `## TL;DR\n\n## Method\n\n## My Notes\n`

    await this.backend.writeFile(paperRel(id), stringifyFrontmatter(data, markdown))

    const ref = this._toRef(id, data, markdown)
    this.refs.set(id, ref)
    this.index.add({
      id,
      title:   ref.title,
      authors: ref.authors.join(' '),
      tags:    ref.tags.join(' '),
      body:    markdown.slice(0, 2000),
    })

    await this._writeCsv()
    return id
  }

  async update(id: PaperId, patch: PaperPatch): Promise<void> {
    const rel = paperRel(id)
    const content = decode(await this.backend.readFile(rel))
    const { data, body } = parseFrontmatter(content)

    const { markdown: newBody, ...metaPatch } = patch
    Object.assign(data, metaPatch, { updated_at: new Date().toISOString() })

    const finalBody = newBody !== undefined ? newBody : body
    await this.backend.writeFile(rel, stringifyFrontmatter(data, finalBody))

    const norm = normalizePaperData(data)
    const ref = this._toRef(id, norm, finalBody)
    this.refs.set(id, ref)

    this.index.discard(id)
    this.index.add({
      id,
      title:   ref.title,
      authors: ref.authors.join(' '),
      tags:    ref.tags.join(' '),
      body:    finalBody.slice(0, 2000),
    })

    await this._writeCsv()
  }

  async delete(id: PaperId): Promise<void> {
    await this.backend.deleteFile(paperRel(id))
    await this.backend.deleteFile(attachRel(id))
    this.refs.delete(id)
    this.hasPdfCache.delete(id)
    this.index.discard(id)
    for (const [name, ids] of this._collections) {
      if (ids.has(id)) {
        ids.delete(id)
        await this._rebuildCollectionCsv(name)
      }
    }
    await this._saveCollections()
    await this._writeCsv()
  }

  // ── Notes ────────────────────────────────────────────────────────────────────

  async appendNote(id: PaperId, section: string, text: string): Promise<void> {
    const rel = paperRel(id)
    const content = decode(await this.backend.readFile(rel))
    const { data, body } = parseFrontmatter(content)

    const heading = `## ${section}`
    let newBody: string

    if (body.includes(heading)) {
      const idx = body.indexOf(heading) + heading.length
      const nextSection = body.indexOf('\n## ', idx)
      const insertAt = nextSection === -1 ? body.length : nextSection
      newBody = body.slice(0, insertAt) + '\n\n' + text + body.slice(insertAt)
    } else {
      newBody = body + `\n\n${heading}\n\n${text}`
    }

    data.updated_at = new Date().toISOString()
    await this.backend.writeFile(rel, stringifyFrontmatter(data, newBody))

    await this.update(id, { updated_at: data.updated_at as string, markdown: newBody })
  }

  async readSection(id: PaperId, section: string): Promise<string> {
    const { markdown } = await this.get(id)
    const heading = `## ${section}`
    const start = markdown.indexOf(heading)
    if (start === -1) return ''
    const contentStart = start + heading.length
    const nextSection = markdown.indexOf('\n## ', contentStart)
    return markdown
      .slice(contentStart, nextSection === -1 ? undefined : nextSection)
      .trim()
  }

  // ── Search ───────────────────────────────────────────────────────────────────

  async search(query: string, filter?: Filter): Promise<SearchHit[]> {
    const ids = searchIndex(this.index, query)
    const terms = query.split(/\s+/).filter(Boolean)

    const hits = ids
      .map(id => {
        const paper = this.refs.get(id)
        if (!paper) return null
        return { paper, score: 1, terms } satisfies SearchHit
      })
      .filter((h): h is SearchHit => h !== null)

    if (!filter) return hits

    return hits.filter(h => {
      if (
        filter.status?.length &&
        !filter.status.includes(h.paper.status)
      ) return false
      if (
        filter.tags?.length &&
        !filter.tags.some(t => h.paper.tags.includes(t))
      ) return false
      if (filter.yearFrom != null && (h.paper.year == null || h.paper.year < filter.yearFrom)) return false
      if (filter.yearTo   != null && (h.paper.year == null || h.paper.year > filter.yearTo))   return false
      return true
    })
  }

  async rebuildIndex(): Promise<void> {
    await this._rebuildCache()
  }

  // ── Import ───────────────────────────────────────────────────────────────────

  async importDoi(doi: string): Promise<PaperId> {
    const draft = await detectAndImport(doi)
    return this.add(draft)
  }

  /**
   * Import a PDF from an absolute filesystem path. The source path is read
   * from the user's OS filesystem (it is outside the library); the destination
   * is written through the backend so it lands wherever the library lives.
   */
  async importPdf(filePath: string): Promise<PaperId> {
    const name = basename(filePath, '.pdf')
    const draft: PaperDraft = { title: name, tags: [] }
    const id = await this.add(draft)

    const localTarget = this.backend.localPath(attachRel(id))
    if (localTarget) {
      // Same filesystem — use copyFile for a fast, atomic-ish copy and avoid
      // buffering the whole PDF in memory.
      await copyFile(filePath, localTarget)
    } else {
      const { readFile } = await import('fs/promises')
      const buf = await readFile(filePath)
      await this.backend.writeFile(attachRel(id), buf)
    }

    this.hasPdfCache.add(id)
    await this.update(id, { pdf: `attachments/${id}.pdf` })
    return id
  }

  // ── CSV ──────────────────────────────────────────────────────────────────────

  async rebuildCsv(): Promise<void> {
    await this._writeCsv()
  }

  // ── PDF path ─────────────────────────────────────────────────────────────────

  /**
   * Local filesystem path to the PDF, or null. S3-backed libraries have no
   * local path; the renderer falls back to streaming via IPC.
   */
  pdfPath(id: PaperId): string | null {
    if (!this.hasPdfCache.has(id)) return null
    return this.backend.localPath(attachRel(id))
  }

  /** Stream the PDF bytes regardless of backend. Caller closes the reader. */
  pdfStream(id: PaperId): ReadableStream<Uint8Array> | null {
    if (!this.hasPdfCache.has(id)) return null
    return this.backend.createReadStream(attachRel(id))
  }
}
