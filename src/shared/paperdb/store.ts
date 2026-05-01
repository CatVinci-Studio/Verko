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
  Highlight,
  HighlightDraft,
} from '@shared/types'
import type { StorageBackend } from '@shared/paperdb/backend'
import { loadSchema, saveSchema } from '@shared/paperdb/schema'
import { parseFrontmatter, normalizePaperData } from '@shared/paperdb/frontmatter'
import { rebuildCsv, parseCsv } from '@shared/paperdb/csv'
import { buildIndex, searchIndex } from '@shared/paperdb/search'
import { generateId } from '@shared/paperdb/id'
import { importFromArxiv } from '@shared/paperdb/arxiv'

const PAPERS_DIR     = 'papers'
const ATTACH_DIR     = 'attachments'
const HIGHLIGHTS_DIR = 'highlights'
const CSV_REL        = 'papers.csv'
const COLLECTIONS_REL = 'collections.json'

const paperRel       = (id: PaperId) => `${PAPERS_DIR}/${id}.md`
const attachRel      = (id: PaperId) => `${ATTACH_DIR}/${id}.pdf`
const highlightRel   = (id: PaperId) => `${HIGHLIGHTS_DIR}/${id}.json`
const collectionCsvRel = (name: string) => `${name}.csv`

const decoder = new TextDecoder('utf-8')
const decode = (bytes: Uint8Array): string => decoder.decode(bytes)

function cryptoRandomId(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * In-memory paper library backed by a `StorageBackend` (filesystem, S3, …).
 *
 * Storage model:
 *   - `papers.csv`        canonical row data (id, title, authors, status,
 *                         user-added columns…) — THE source of truth for fields
 *   - `papers/<id>.md`    markdown body only (notes). No frontmatter.
 *                         Created lazily; missing means "no notes yet".
 *   - `schema.md`         column definitions (still uses YAML frontmatter)
 *   - `collections.json`  collection memberships
 *   - `attachments/`      PDF attachments
 *
 * The MiniSearch index is built lazily on the first search() call (it
 * needs the markdown bodies, which we'd rather not read at startup).
 *
 * Construct with `Library.open(backend)`.
 */
export class Library {
  readonly backend: StorageBackend
  private _schema!: Schema
  private refs = new Map<PaperId, PaperRef>()
  private hasPdfCache = new Set<PaperId>()
  private index: MiniSearch
  private indexBuilt = false
  private indexBuildPromise: Promise<void> | null = null
  private _collections = new Map<string, Set<PaperId>>()

  private constructor(backend: StorageBackend) {
    this.backend = backend
    this.index = buildIndex([])
  }

  static async open(backend: StorageBackend): Promise<Library> {
    const lib = new Library(backend)
    await lib._init()
    return lib
  }

  private async _init(): Promise<void> {
    this._schema = await loadSchema(this.backend)
    await saveSchema(this.backend, this._schema)
    await this._loadCollections()
    await this._loadAttachmentIndex()

    const csvLoaded = await this._tryLoadRefsFromCsv()
    if (!csvLoaded) {
      // Either a brand-new library (no CSV, no .md) or a legacy library
      // whose .md files still hold frontmatter. The bootstrap path handles
      // both: it scans .md, builds CSV, and strips frontmatter from .md.
      await this._bootstrapFromLegacyMd()
    }
  }

  // ── Init helpers ────────────────────────────────────────────────────────────

  private async _loadAttachmentIndex(): Promise<void> {
    this.hasPdfCache.clear()
    const files = await this.backend.listFiles(ATTACH_DIR)
    for (const rel of files) {
      const name = rel.split('/').pop() ?? ''
      if (name.endsWith('.pdf')) this.hasPdfCache.add(name.slice(0, -'.pdf'.length))
    }
  }

  private async _tryLoadRefsFromCsv(): Promise<boolean> {
    if (!(await this.backend.exists(CSV_REL))) return false
    const refs = await parseCsv(this.backend, CSV_REL, this._schema)
    if (refs.length === 0) return false
    this.refs.clear()
    for (const ref of refs) {
      ref.hasPdf = this.hasPdfCache.has(ref.id)
      this.refs.set(ref.id, ref)
    }
    return true
  }

  /**
   * Legacy path. Older libraries stored each paper's metadata in YAML
   * frontmatter at the top of `papers/<id>.md`. On first open under the
   * new model, we extract frontmatter into CSV, then rewrite each .md
   * with body-only content.
   */
  private async _bootstrapFromLegacyMd(): Promise<void> {
    this.refs.clear()
    const allFiles = await this.backend.listFiles(PAPERS_DIR)
    for (const rel of allFiles) {
      if (!rel.endsWith('.md')) continue
      const file = rel.slice(`${PAPERS_DIR}/`.length)
      const id = file.endsWith('.md') ? file.slice(0, -3) : file
      try {
        const content = decode(await this.backend.readFile(rel))
        const { data, body } = parseFrontmatter(content)
        if (Object.keys(data).length === 0) {
          // Already body-only; keep a minimal ref so the paper isn't lost.
          const now = new Date().toISOString()
          this.refs.set(id, {
            id, title: id, authors: [], tags: [], status: 'unread',
            added_at: now, updated_at: now, hasPdf: this.hasPdfCache.has(id),
          })
          continue
        }
        const norm = normalizePaperData({ ...data, id })
        const ref = this._refFromData(id, norm)
        this.refs.set(id, ref)
        // Strip frontmatter — write body only.
        await this.backend.writeFile(rel, body)
      } catch {
        // skip malformed
      }
    }
    if (this.refs.size > 0) {
      await this._writeCsv()
    }
  }

  private _refFromData(id: PaperId, data: Record<string, unknown>): PaperRef {
    const now = new Date().toISOString()
    return {
      id,
      title:      (data['title']    as string) || id,
      authors:    (data['authors']  as string[]) || [],
      year:       data['year']      as number | undefined,
      venue:      data['venue']     as string | undefined,
      doi:        data['doi']       as string | undefined,
      url:        data['url']       as string | undefined,
      tags:       (data['tags']     as string[]) || [],
      status:     (data['status']   as PaperRef['status']) || 'unread',
      rating:     data['rating']    as number | undefined,
      added_at:   (data['added_at']   as string) || now,
      updated_at: (data['updated_at'] as string) || now,
      hasPdf:     this.hasPdfCache.has(id),
      ...extractExtraColumns(data, this._schema),
    }
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

  private async _writeCsv(): Promise<void> {
    await rebuildCsv(this.backend, CSV_REL, Array.from(this.refs.values()), this._schema)
  }

  // ── Search index (lazy) ─────────────────────────────────────────────────────

  private async _ensureIndex(): Promise<void> {
    if (this.indexBuilt) return
    if (this.indexBuildPromise) return this.indexBuildPromise
    this.indexBuildPromise = this._buildIndex().finally(() => {
      this.indexBuildPromise = null
    })
    return this.indexBuildPromise
  }

  private async _buildIndex(): Promise<void> {
    const docs: Array<{ id: string; title: string; authors: string; tags: string; body: string }> = []
    for (const [id, ref] of this.refs) {
      let body = ''
      try { body = decode(await this.backend.readFile(paperRel(id))) } catch { /* missing notes */ }
      docs.push({
        id,
        title: ref.title,
        authors: ref.authors.join(' '),
        tags: ref.tags.join(' '),
        body: body.slice(0, 2000),
      })
    }
    this.index = buildIndex(docs)
    this.indexBuilt = true
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

  /**
   * Add a column. Pure CSV/schema operation — `.md` notes are not touched.
   * Existing rows get the column's default value (or undefined).
   */
  async addColumn(col: Column): Promise<void> {
    if (this._schema.columns.find((c) => c.name === col.name)) return
    this._schema.columns.push(col)
    await saveSchema(this.backend, this._schema)
    if (col.default !== undefined) {
      for (const ref of this.refs.values()) {
        const r = ref as Record<string, unknown>
        if (!(col.name in r)) r[col.name] = col.default
      }
    }
    await this._writeCsv()
  }

  async removeColumn(name: string): Promise<void> {
    this._schema.columns = this._schema.columns.filter(c => c.name !== name)
    await saveSchema(this.backend, this._schema)
    for (const ref of this.refs.values()) {
      delete (ref as Record<string, unknown>)[name]
    }
    await this._writeCsv()
  }

  async renameColumn(from: string, to: string): Promise<void> {
    const col = this._schema.columns.find(c => c.name === from)
    if (col) col.name = to
    await saveSchema(this.backend, this._schema)
    for (const ref of this.refs.values()) {
      const r = ref as Record<string, unknown>
      if (from in r) {
        r[to] = r[from]
        delete r[from]
      }
    }
    await this._writeCsv()
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
      await this._ensureIndex()
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
    const ref = this.refs.get(id)
    if (!ref) throw new Error(`Paper "${id}" not found`)
    let body = ''
    try { body = decode(await this.backend.readFile(paperRel(id))) } catch { /* no notes yet */ }
    return { ...ref, markdown: body }
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

    const ref: PaperRef = {
      id,
      title:      draft.title || 'Untitled',
      authors:    draft.authors || [],
      year:       draft.year,
      venue:      draft.venue,
      doi:        draft.doi,
      url:        draft.url,
      tags:       draft.tags || [],
      status:     draft.status || 'unread',
      rating:     typeof draft.rating === 'number' ? draft.rating : undefined,
      added_at:   now,
      updated_at: now,
      hasPdf:     this.hasPdfCache.has(id),
      ...extras,
    }
    // Apply schema defaults for any custom columns not provided.
    for (const col of this._schema.columns) {
      const r = ref as Record<string, unknown>
      if (!(col.name in r) && col.default !== undefined) {
        r[col.name] = col.default
      }
    }

    this.refs.set(id, ref)

    // Write body-only .md (no frontmatter).
    const body = draft.markdown || `## TL;DR\n\n## Method\n\n## My Notes\n`
    await this.backend.writeFile(paperRel(id), body)

    await this._writeCsv()

    if (this.indexBuilt) {
      this.index.add({
        id,
        title:   ref.title,
        authors: ref.authors.join(' '),
        tags:    ref.tags.join(' '),
        body:    body.slice(0, 2000),
      })
    }

    return id
  }

  async update(id: PaperId, patch: PaperPatch): Promise<void> {
    const ref = this.refs.get(id)
    if (!ref) throw new Error(`Paper "${id}" not found`)

    const { markdown: newBody, ...metaPatch } = patch

    let metaChanged = false
    for (const [k, v] of Object.entries(metaPatch)) {
      if (v === undefined) continue
      ;(ref as Record<string, unknown>)[k] = v
      metaChanged = true
    }

    if (newBody !== undefined) {
      await this.backend.writeFile(paperRel(id), newBody)
    }

    if (metaChanged || newBody !== undefined) {
      ref.updated_at = new Date().toISOString()
      await this._writeCsv()
    }

    if (this.indexBuilt) {
      let body = newBody
      if (body === undefined) {
        try { body = decode(await this.backend.readFile(paperRel(id))) }
        catch { body = '' }
      }
      this.index.discard(id)
      this.index.add({
        id,
        title:   ref.title,
        authors: ref.authors.join(' '),
        tags:    ref.tags.join(' '),
        body:    body.slice(0, 2000),
      })
    }
  }

  async delete(id: PaperId): Promise<void> {
    await this.backend.deleteFile(paperRel(id))
    await this.backend.deleteFile(attachRel(id))
    this.refs.delete(id)
    this.hasPdfCache.delete(id)
    if (this.indexBuilt) this.index.discard(id)

    let collectionsChanged = false
    for (const [name, ids] of this._collections) {
      if (ids.has(id)) {
        ids.delete(id)
        collectionsChanged = true
        await this._rebuildCollectionCsv(name)
      }
    }
    if (collectionsChanged) await this._saveCollections()
    await this._writeCsv()
  }

  // ── Notes ────────────────────────────────────────────────────────────────────

  /**
   * Append text to a section of the paper's notes. Creates the section if
   * absent. Touches only the .md (not the CSV row), but bumps `updated_at`.
   */
  async appendNote(id: PaperId, section: string, text: string): Promise<void> {
    const ref = this.refs.get(id)
    if (!ref) throw new Error(`Paper "${id}" not found`)

    let body = ''
    try { body = decode(await this.backend.readFile(paperRel(id))) } catch { /* none yet */ }

    const heading = `## ${section}`
    let newBody: string
    if (body.includes(heading)) {
      const idx = body.indexOf(heading) + heading.length
      const nextSection = body.indexOf('\n## ', idx)
      const insertAt = nextSection === -1 ? body.length : nextSection
      newBody = body.slice(0, insertAt) + '\n\n' + text + body.slice(insertAt)
    } else {
      const sep = body.length > 0 ? '\n\n' : ''
      newBody = `${body}${sep}${heading}\n\n${text}`
    }

    await this.backend.writeFile(paperRel(id), newBody)
    ref.updated_at = new Date().toISOString()
    await this._writeCsv()

    if (this.indexBuilt) {
      this.index.discard(id)
      this.index.add({
        id,
        title:   ref.title,
        authors: ref.authors.join(' '),
        tags:    ref.tags.join(' '),
        body:    newBody.slice(0, 2000),
      })
    }
  }

  // ── Search ───────────────────────────────────────────────────────────────────

  async search(query: string, filter?: Filter): Promise<SearchHit[]> {
    await this._ensureIndex()
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
      if (filter.status?.length && !filter.status.includes(h.paper.status)) return false
      if (filter.tags?.length && !filter.tags.some(t => h.paper.tags.includes(t))) return false
      if (filter.yearFrom != null && (h.paper.year == null || h.paper.year < filter.yearFrom)) return false
      if (filter.yearTo   != null && (h.paper.year == null || h.paper.year > filter.yearTo))   return false
      return true
    })
  }

  // ── Import ───────────────────────────────────────────────────────────────────

  async importArxiv(input: string): Promise<PaperId> {
    const draft = await importFromArxiv(input)
    return this.add(draft)
  }

  async markPdfPresent(id: PaperId): Promise<void> {
    this.hasPdfCache.add(id)
    const ref = this.refs.get(id)
    if (ref) ref.hasPdf = true
  }

  pdfPath(id: PaperId): string | null {
    if (!this.hasPdfCache.has(id)) return null
    return this.backend.localPath(attachRel(id))
  }

  pdfStream(id: PaperId): ReadableStream<Uint8Array> | null {
    if (!this.hasPdfCache.has(id)) return null
    return this.backend.createReadStream(attachRel(id))
  }

  // ── Highlights ───────────────────────────────────────────────────────────────
  // Stored at `highlights/<paperId>.json` as a JSON array. Coordinates are
  // page-percent (0..1) so they survive zoom changes. Missing file = no
  // highlights yet — never an error.

  async listHighlights(id: PaperId): Promise<Highlight[]> {
    try {
      const bytes = await this.backend.readFile(highlightRel(id))
      const parsed = JSON.parse(decode(bytes)) as Highlight[]
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  async addHighlight(id: PaperId, draft: HighlightDraft): Promise<Highlight> {
    const list = await this.listHighlights(id)
    const h: Highlight = {
      id: cryptoRandomId(),
      page: draft.page,
      text: draft.text,
      rects: draft.rects,
      createdAt: new Date().toISOString(),
      ...(draft.color != null ? { color: draft.color } : {}),
      ...(draft.note != null ? { note: draft.note } : {}),
      ...(draft.groupId != null ? { groupId: draft.groupId } : {}),
    }
    list.push(h)
    await this.backend.writeFile(highlightRel(id), JSON.stringify(list, null, 2))
    return h
  }

  /**
   * Patch semantics:
   *   - `note: undefined` → field untouched
   *   - `note: ''`        → clear (drop the field)
   *   - `note: 'text'`    → set
   *   - `color: undefined` → untouched
   *   - `color: <value>`  → set
   */
  async updateHighlight(
    id: PaperId,
    highlightId: string,
    patch: Partial<Pick<Highlight, 'note' | 'color'>>,
  ): Promise<Highlight | null> {
    const list = await this.listHighlights(id)
    const idx = list.findIndex((h) => h.id === highlightId)
    if (idx < 0) return null
    const next: Highlight = { ...list[idx] }
    if (patch.note !== undefined) {
      if (patch.note === '') delete next.note
      else next.note = patch.note
    }
    if (patch.color !== undefined) next.color = patch.color
    list[idx] = next
    await this.backend.writeFile(highlightRel(id), JSON.stringify(list, null, 2))
    return next
  }

  async deleteHighlight(id: PaperId, highlightId: string): Promise<void> {
    const list = await this.listHighlights(id)
    const next = list.filter((h) => h.id !== highlightId)
    if (next.length === list.length) return
    if (next.length === 0) {
      try { await this.backend.deleteFile(highlightRel(id)) } catch { /* fine */ }
      return
    }
    await this.backend.writeFile(highlightRel(id), JSON.stringify(next, null, 2))
  }

  // ── Skills ───────────────────────────────────────────────────────────────────

  /**
   * User-defined skill files at `skills/<name>.md`. Each file has YAML
   * frontmatter (`name`, `description`) plus a markdown body. The two-layer
   * pattern: list `name` + `description` for the system prompt; only fetch
   * the body via `getSkill` when the agent decides to load it.
   *
   * Cached on first access; call `refreshSkills()` after external edits.
   */
  private skillsCache: Array<{ name: string; description: string; body: string }> | null = null

  private async _loadSkills(): Promise<void> {
    const out: Array<{ name: string; description: string; body: string }> = []
    let files: string[] = []
    try {
      files = await this.backend.listFiles('skills')
    } catch { /* no skills/ — fine */ }
    for (const rel of files) {
      if (!rel.endsWith('.md')) continue
      const fileName = rel.slice('skills/'.length, -'.md'.length)
      try {
        const text = decode(await this.backend.readFile(rel))
        const { data, body } = parseFrontmatter(text)
        const name = (data['name'] as string | undefined) ?? fileName
        const description = (data['description'] as string | undefined) ?? ''
        out.push({ name, description, body: body.trim() })
      } catch { /* skip malformed */ }
    }
    this.skillsCache = out
  }

  async listSkills(): Promise<Array<{ name: string; description: string }>> {
    if (!this.skillsCache) await this._loadSkills()
    return this.skillsCache!.map(({ name, description }) => ({ name, description }))
  }

  async getSkill(name: string): Promise<string | null> {
    if (!this.skillsCache) await this._loadSkills()
    const s = this.skillsCache!.find((s) => s.name === name)
    return s?.body ?? null
  }
}

function extractExtraColumns(data: Record<string, unknown>, schema: Schema): Record<string, unknown> {
  const known = new Set([
    'id', 'title', 'authors', 'year', 'venue', 'doi', 'url',
    'tags', 'status', 'rating', 'added_at', 'updated_at',
  ])
  const out: Record<string, unknown> = {}
  const schemaCols = new Set(schema.columns.map((c) => c.name))
  for (const [k, v] of Object.entries(data)) {
    if (known.has(k)) continue
    if (!schemaCols.has(k)) continue
    out[k] = v
  }
  return out
}
