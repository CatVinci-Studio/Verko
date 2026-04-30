import { mkdir, readdir } from 'fs/promises'
import Store from 'electron-store'
import { Library } from '@shared/paperdb/store'
import { LocalBackend } from './backendLocal'
import { S3Backend } from '@shared/paperdb/backendS3'
import type { StorageBackend } from '@shared/paperdb/backend'
import { LibraryRegistry, type LibraryEntry } from '../libraries/registry'
import { CredentialStore } from '../libraries/credentials'
import type { LibraryInfo, NewLibraryInput } from '@shared/types'

/**
 * Orchestrates the registry, credential store, and live `Library` instances.
 * The active library is the most recently opened entry in the registry.
 */
export class LibraryManager {
  private cache = new Map<string, Library>()
  private activeId: string | null = null
  private failedLastOpen: { id: string; message: string } | null = null

  private constructor(
    public readonly registry: LibraryRegistry,
    public readonly credentials: CredentialStore,
  ) {}

  /**
   * Initialize the manager. Loads the registry, attempts a one-shot migration
   * from the old electron-store config, and tries to open the last-used
   * library. The window may end up with no active library — callers should
   * check `hasActive()` and surface the welcome screen.
   */
  static async init(
    registry: LibraryRegistry,
    credentials: CredentialStore,
  ): Promise<LibraryManager> {
    await registry.load()
    await credentials.load()
    const mgr = new LibraryManager(registry, credentials)

    if (registry.isEmpty()) {
      await migrateFromLegacyStore(registry)
    }

    const last = registry.getLastOpened()
    if (last) {
      try {
        await mgr.openInternal(last.id)
      } catch (e) {
        mgr.failedLastOpen = {
          id: last.id,
          message: e instanceof Error ? e.message : String(e),
        }
      }
    }

    return mgr
  }

  // ── Active library ──────────────────────────────────────────────────────

  hasActive(): boolean {
    return this.activeId != null
  }

  get active(): Library {
    if (!this.activeId) throw new Error('No active library')
    const lib = this.cache.get(this.activeId)
    if (!lib) throw new Error(`Library "${this.activeId}" not loaded`)
    return lib
  }

  get activeName(): string {
    if (!this.activeId) return ''
    return this.registry.get(this.activeId)?.name ?? ''
  }

  get activeId_(): string | null {
    return this.activeId
  }

  getFailedLastOpen(): { id: string; message: string } | null {
    return this.failedLastOpen
  }

  // ── List ────────────────────────────────────────────────────────────────

  async list(): Promise<LibraryInfo[]> {
    const out: LibraryInfo[] = []
    for (const e of this.registry.list()) {
      const cached = this.cache.get(e.id)
      const paperCount = cached ? (await cached.list()).length : 0
      out.push(this.toInfo(e, paperCount))
    }
    return out
  }

  private toInfo(e: LibraryEntry, paperCount: number): LibraryInfo {
    const base = {
      id: e.id,
      name: e.name,
      active: e.id === this.activeId,
      paperCount,
      lastOpenedAt: e.lastOpenedAt,
    }
    if (e.type === 'local') {
      return { ...base, kind: 'local', path: e.path }
    }
    return {
      ...base,
      kind: 's3',
      endpoint: e.s3.endpoint,
      region: e.s3.region,
      bucket: e.s3.bucket,
      prefix: e.s3.prefix,
    }
  }

  // ── Open / switch ────────────────────────────────────────────────────────

  async open(id: string): Promise<LibraryInfo> {
    await this.openInternal(id)
    const e = this.registry.get(id)!
    const lib = this.cache.get(id)!
    return this.toInfo(e, (await lib.list()).length)
  }

  private async openInternal(id: string): Promise<void> {
    const e = this.registry.get(id)
    if (!e) throw new Error(`Library "${id}" not in registry`)

    if (!this.cache.has(id)) {
      const backend = await this.buildBackend(e)
      const lib = await Library.open(backend)
      this.cache.set(id, lib)
    }

    this.activeId = id
    this.failedLastOpen = null
    await this.registry.markOpened(id)
  }

  private async buildBackend(e: LibraryEntry): Promise<StorageBackend> {
    if (e.type === 'local') {
      const be = new LocalBackend(e.path)
      await be.ensureRoot()
      return be
    }
    const creds = this.credentials.get(e.s3.credentialRef)
    if (!creds) throw new Error('S3 credentials are missing — re-enter them in settings')
    return new S3Backend({
      endpoint: e.s3.endpoint,
      region: e.s3.region,
      bucket: e.s3.bucket,
      prefix: e.s3.prefix,
      forcePathStyle: e.s3.forcePathStyle,
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
    })
  }

  // ── Add ─────────────────────────────────────────────────────────────────

  async add(input: NewLibraryInput): Promise<LibraryInfo> {
    if (input.kind === 'local') {
      if (input.initialize) await mkdir(input.path, { recursive: true })
      const entry = await this.registry.add({
        name: input.name,
        type: 'local',
        path: input.path,
      })
      // Open so the cache is warm and we can report paperCount.
      await this.openInternal(entry.id)
      const lib = this.cache.get(entry.id)!
      return this.toInfo(this.registry.get(entry.id)!, (await lib.list()).length)
    }

    // S3
    const credentialRef = await this.credentials.create({
      accessKeyId: input.accessKeyId,
      secretAccessKey: input.secretAccessKey,
    })
    const entry = await this.registry.add({
      name: input.name,
      type: 's3',
      s3: {
        endpoint: input.endpoint,
        region: input.region,
        bucket: input.bucket,
        prefix: input.prefix,
        forcePathStyle: input.forcePathStyle,
        credentialRef,
      },
    })
    await this.openInternal(entry.id)
    const lib = this.cache.get(entry.id)!
    return this.toInfo(this.registry.get(entry.id)!, (await lib.list()).length)
  }

  // ── Remove (unregister only) ─────────────────────────────────────────────

  async remove(id: string): Promise<void> {
    const entry = this.registry.get(id)
    if (!entry) return
    if (this.activeId === id) this.activeId = null
    this.cache.delete(id)
    if (entry.type === 's3') {
      await this.credentials.delete(entry.s3.credentialRef)
    }
    await this.registry.remove(id)
  }

  // ── Rename ──────────────────────────────────────────────────────────────

  async rename(id: string, newName: string): Promise<void> {
    await this.registry.update(id, { name: newName })
  }
}

// ── Legacy migration ──────────────────────────────────────────────────────

interface LegacyConfig {
  libraries: Array<{ name: string; path: string; createdAt: string }>
  active: string
}

/**
 * One-shot import of the previous electron-store-based library list. Runs
 * only when the new registry is empty so existing users don't see the
 * welcome screen on first upgrade.
 */
async function migrateFromLegacyStore(registry: LibraryRegistry): Promise<void> {
  let cfg: LegacyConfig | null = null
  try {
    const store = new Store<{ config: LegacyConfig }>({
      name: 'libraries',
      defaults: { config: { libraries: [], active: '' } },
    })
    cfg = store.get('config')
  } catch {
    return
  }

  if (!cfg || cfg.libraries.length === 0) return

  for (const l of cfg.libraries) {
    if (!(await dirExists(l.path))) continue
    await registry.add({
      name: l.name,
      type: 'local',
      path: l.path,
    })
  }

  // Set lastOpenedId to whatever was active before, if it survived the import.
  const list = registry.list()
  const wasActive = list.find((e) => e.type === 'local' && e.name === cfg!.active)
  if (wasActive) await registry.markOpened(wasActive.id)
  else if (list[0]) await registry.markOpened(list[0].id)
}

async function dirExists(p: string): Promise<boolean> {
  try {
    await readdir(p)
    return true
  } catch {
    return false
  }
}
