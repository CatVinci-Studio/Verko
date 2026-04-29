import { mkdir, readdir, readFile, writeFile, rm, copyFile, access } from 'fs/promises'
import { existsSync } from 'fs'
import { join, basename } from 'path'
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
import { loadSchema, saveSchema } from './schema'
import { parseFrontmatter, stringifyFrontmatter, normalizePaperData } from './frontmatter'
import { rebuildCsv } from './csv'
import { buildIndex, searchIndex } from './search'
import { generateId } from './id'
import { detectAndImport } from './import'

export class Library {
  readonly root: string
  private _schema!: Schema
  private refs = new Map<PaperId, PaperRef>()
  private index!: MiniSearch
  private _collections = new Map<string, Set<PaperId>>()

  private constructor(root: string) {
    this.root = root
  }

  get papersDir(): string       { return join(this.root, 'papers') }
  get attachDir(): string       { return join(this.root, 'attachments') }
  get csvPath(): string         { return join(this.root, 'papers.csv') }
  get schemaPath(): string      { return join(this.root, 'schema.json') }
  get collectionsPath(): string { return join(this.root, 'collections.json') }

  static async open(root: string): Promise<Library> {
    const lib = new Library(root)
    await lib._init()
    return lib
  }

  private async _init(): Promise<void> {
    await mkdir(this.papersDir, { recursive: true })
    await mkdir(this.attachDir, { recursive: true })
    this._schema = await loadSchema(this.root)
    await saveSchema(this.root, this._schema)
    await this._loadCollections()
    await this._rebuildCache()
  }

  // ── Collections persistence ──────────────────────────────────────────────────

  private async _loadCollections(): Promise<void> {
    try {
      const raw = await readFile(this.collectionsPath, 'utf-8')
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
    await writeFile(this.collectionsPath, JSON.stringify(data, null, 2), 'utf-8')
  }

  private async _rebuildCollectionCsv(name: string): Promise<void> {
    const ids = this._collections.get(name)
    if (!ids) return
    const refs = Array.from(ids).map(id => this.refs.get(id)).filter((r): r is PaperRef => r != null)
    await rebuildCsv(join(this.root, `${name}.csv`), refs, this._schema)
  }

  private async _rebuildCache(): Promise<void> {
    this.refs.clear()
    const files = await readdir(this.papersDir).catch(() => [] as string[])
    const indexDocs: Array<{
      id: string
      title: string
      authors: string
      tags: string
      body: string
    }> = []

    for (const file of files.filter(f => f.endsWith('.md'))) {
      try {
        const id = basename(file, '.md')
        const content = await readFile(join(this.papersDir, file), 'utf-8')
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

    // Rebuild CSV if missing
    try {
      await access(this.csvPath)
    } catch {
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
      hasPdf:     existsSync(join(this.attachDir, `${id}.pdf`)),
      doi:        data.doi as string | undefined,
      url:        data.url as string | undefined,
    }
  }

  private async _writeCsv(): Promise<void> {
    await rebuildCsv(this.csvPath, Array.from(this.refs.values()), this._schema)
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
    await rebuildCsv(join(this.root, `${name}.csv`), [], this._schema)
  }

  async deleteCollection(name: string): Promise<void> {
    this._collections.delete(name)
    await this._saveCollections()
    await rm(join(this.root, `${name}.csv`), { force: true })
  }

  async renameCollection(oldName: string, newName: string): Promise<void> {
    const ids = this._collections.get(oldName)
    if (!ids) return
    this._collections.delete(oldName)
    this._collections.set(newName, ids)
    await this._saveCollections()
    await rm(join(this.root, `${oldName}.csv`), { force: true })
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
    await saveSchema(this.root, this._schema)

    // Add default value to all existing MD files
    for (const [id] of this.refs) {
      const path = join(this.papersDir, `${id}.md`)
      const content = await readFile(path, 'utf-8')
      const { data, body } = parseFrontmatter(content)
      if (!(col.name in data)) {
        data[col.name] = col.default ?? null
        await writeFile(path, stringifyFrontmatter(data, body), 'utf-8')
      }
    }

    await this._writeCsv()
  }

  async removeColumn(name: string): Promise<void> {
    this._schema.columns = this._schema.columns.filter(c => c.name !== name)
    await saveSchema(this.root, this._schema)
    await this._writeCsv()
  }

  async renameColumn(from: string, to: string): Promise<void> {
    const col = this._schema.columns.find(c => c.name === from)
    if (col) col.name = to
    await saveSchema(this.root, this._schema)

    // Rename key in all MD files
    for (const [id] of this.refs) {
      const path = join(this.papersDir, `${id}.md`)
      const content = await readFile(path, 'utf-8')
      const { data, body } = parseFrontmatter(content)
      if (from in data) {
        data[to] = data[from]
        delete data[from]
      }
      await writeFile(path, stringifyFrontmatter(data, body), 'utf-8')
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
    const path = join(this.papersDir, `${id}.md`)
    const content = await readFile(path, 'utf-8')
    const { data, body } = parseFrontmatter(content)
    const norm = normalizePaperData(data)
    const ref = this._toRef(id, norm, body)
    return { ...norm, ...ref, markdown: body }
  }

  async add(draft: PaperDraft): Promise<PaperId> {
    const id = generateId(draft)
    const now = new Date().toISOString()

    // Separate known fields from custom extras
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

    await writeFile(
      join(this.papersDir, `${id}.md`),
      stringifyFrontmatter(data, markdown),
      'utf-8'
    )

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
    const path = join(this.papersDir, `${id}.md`)
    const content = await readFile(path, 'utf-8')
    const { data, body } = parseFrontmatter(content)

    const { markdown: newBody, ...metaPatch } = patch
    Object.assign(data, metaPatch, { updated_at: new Date().toISOString() })

    const finalBody = newBody !== undefined ? newBody : body
    await writeFile(path, stringifyFrontmatter(data, finalBody), 'utf-8')

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
    await rm(join(this.papersDir, `${id}.md`), { force: true })
    this.refs.delete(id)
    this.index.discard(id)
    // Remove from all collections and rebuild their CSVs
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
    const path = join(this.papersDir, `${id}.md`)
    const content = await readFile(path, 'utf-8')
    const { data, body } = parseFrontmatter(content)

    const heading = `## ${section}`
    let newBody: string

    if (body.includes(heading)) {
      // Find end of section (next ## heading or EOF), insert before it
      const idx = body.indexOf(heading) + heading.length
      const nextSection = body.indexOf('\n## ', idx)
      const insertAt = nextSection === -1 ? body.length : nextSection
      newBody =
        body.slice(0, insertAt) + '\n\n' + text + body.slice(insertAt)
    } else {
      newBody = body + `\n\n${heading}\n\n${text}`
    }

    data.updated_at = new Date().toISOString()
    await writeFile(path, stringifyFrontmatter(data, newBody), 'utf-8')

    // Sync the updated_at into cache without a full rebuild
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

  async importPdf(filePath: string): Promise<PaperId> {
    const name = basename(filePath, '.pdf')
    const draft: PaperDraft = { title: name, tags: [] }
    const id = await this.add(draft)
    await copyFile(filePath, join(this.attachDir, `${id}.pdf`))
    await this.update(id, { pdf: `attachments/${id}.pdf` })
    return id
  }

  // ── CSV ──────────────────────────────────────────────────────────────────────

  async rebuildCsv(): Promise<void> {
    await this._writeCsv()
  }

  // ── PDF path ─────────────────────────────────────────────────────────────────

  pdfPath(id: PaperId): string | null {
    const p = join(this.attachDir, `${id}.pdf`)
    return existsSync(p) ? p : null
  }
}
