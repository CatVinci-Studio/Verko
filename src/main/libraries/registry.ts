import { app } from 'electron'
import { join } from 'path'
import { mkdir, readFile, writeFile, rename } from 'fs/promises'
import { randomUUID } from 'crypto'

export interface LocalLibraryEntry {
  id: string
  name: string
  type: 'local'
  path: string
  lastOpenedAt?: number
}

export interface S3LibraryEntry {
  id: string
  name: string
  type: 's3'
  s3: {
    endpoint?: string
    region: string
    bucket: string
    prefix?: string
    forcePathStyle?: boolean
    credentialRef: string
  }
  lastOpenedAt?: number
}

export type LibraryEntry = LocalLibraryEntry | S3LibraryEntry

export interface LibrariesFile {
  version: 1
  entries: LibraryEntry[]
  lastOpenedId?: string
}

const emptyState = (): LibrariesFile => ({ version: 1, entries: [] })

/**
 * On-disk registry of configured libraries. Lives at
 * `<userData>/libraries.json`. Credentials for S3 entries are stored
 * separately via the credential store, referenced by `credentialRef`.
 */
export class LibraryRegistry {
  private state: LibrariesFile = emptyState()

  constructor(private readonly path: string) {}

  /** Build a registry rooted at `app.getPath('userData')`. */
  static fromUserData(): LibraryRegistry {
    return new LibraryRegistry(join(app.getPath('userData'), 'libraries.json'))
  }

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.path, 'utf-8')
      const parsed = JSON.parse(raw) as LibrariesFile
      if (parsed.version !== 1 || !Array.isArray(parsed.entries)) throw new Error('bad shape')
      this.state = parsed
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        this.state = emptyState()
        return
      }
      // Corrupt file — back it up and start fresh.
      try {
        await rename(this.path, `${this.path}.corrupt-${Date.now()}`)
      } catch { /* nothing to back up */ }
      this.state = emptyState()
    }
  }

  private async save(): Promise<void> {
    await mkdir(join(this.path, '..'), { recursive: true })
    await writeFile(this.path, JSON.stringify(this.state, null, 2), 'utf-8')
  }

  list(): LibraryEntry[] {
    return [...this.state.entries]
  }

  get(id: string): LibraryEntry | undefined {
    return this.state.entries.find((e) => e.id === id)
  }

  getLastOpened(): LibraryEntry | undefined {
    if (this.state.lastOpenedId) {
      const e = this.get(this.state.lastOpenedId)
      if (e) return e
    }
    return this.state.entries[0]
  }

  isEmpty(): boolean {
    return this.state.entries.length === 0
  }

  async add(entry: Omit<LibraryEntry, 'id'>): Promise<LibraryEntry> {
    const created = { ...entry, id: randomUUID() } as LibraryEntry
    this.state.entries.push(created)
    await this.save()
    return created
  }

  async update(id: string, patch: Partial<LibraryEntry>): Promise<void> {
    const idx = this.state.entries.findIndex((e) => e.id === id)
    if (idx === -1) return
    this.state.entries[idx] = { ...this.state.entries[idx], ...patch } as LibraryEntry
    await this.save()
  }

  async remove(id: string): Promise<LibraryEntry | undefined> {
    const idx = this.state.entries.findIndex((e) => e.id === id)
    if (idx === -1) return undefined
    const [removed] = this.state.entries.splice(idx, 1)
    if (this.state.lastOpenedId === id) this.state.lastOpenedId = undefined
    await this.save()
    return removed
  }

  async markOpened(id: string): Promise<void> {
    const entry = this.get(id)
    if (!entry) return
    entry.lastOpenedAt = Date.now()
    this.state.lastOpenedId = id
    await this.save()
  }
}
