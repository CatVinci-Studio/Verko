import { mkdir, readdir } from 'fs/promises'
import Store from 'electron-store'
import { LocalBackend } from './backendLocal'
import { S3Backend } from '@shared/paperdb/backendS3'
import type { StorageBackend } from '@shared/paperdb/backend'
import { LibraryRegistry, type LibraryEntry } from '../libraries/registry'
import { CredentialStore } from '../libraries/credentials'
import { registerRoot, unregisterRoot } from '../scope'
import type { LibraryInfo, NewLibraryInput } from '@shared/types'

/**
 * Registry-only library manager. Maintains the on-disk registry and
 * credential store; the renderer is responsible for opening Libraries.
 *
 * Main no longer caches `Library` instances — the renderer holds the single
 * source of truth at runtime and writes through the zero-trust `fs:*` IPC
 * (or the S3 SDK directly).
 */
export class LibraryManager {
  private activeId: string | null = null
  private failedLastOpen: { id: string; message: string } | null = null

  private constructor(
    public readonly registry: LibraryRegistry,
    public readonly credentials: CredentialStore,
  ) {}

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

    // Register every local library as an allowed fs:* scope.
    for (const e of registry.list()) {
      if (e.type === 'local') registerRoot(e.id, e.path)
    }

    const last = registry.getLastOpened()
    if (last) {
      try {
        await mgr.markActive(last.id)
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

  get activeIdValue(): string | null {
    return this.activeId
  }

  get activeName(): string {
    if (!this.activeId) return ''
    return this.registry.get(this.activeId)?.name ?? ''
  }

  getFailedLastOpen(): { id: string; message: string } | null {
    return this.failedLastOpen
  }

  // ── List ────────────────────────────────────────────────────────────────

  list(): LibraryInfo[] {
    // paperCount=0 here; renderer fills it from its own Library when available.
    return this.registry.list().map((e) => this.toInfo(e, 0))
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

  /** Mark a library active in the registry. Renderer constructs the Library. */
  async markActive(id: string): Promise<LibraryInfo> {
    const entry = this.registry.get(id)
    if (!entry) throw new Error(`Library "${id}" not in registry`)
    this.activeId = id
    this.failedLastOpen = null
    await this.registry.markOpened(id)
    return this.toInfo(entry, 0)
  }

  /** Build a backend for `exportZip` and similar main-side bulk ops. */
  buildBackend(id: string): StorageBackend {
    const e = this.registry.get(id)
    if (!e) throw new Error(`Library "${id}" not in registry`)
    if (e.type === 'local') return new LocalBackend(e.path)
    const creds = this.credentials.get(e.s3.credentialRef)
    if (!creds) throw new Error('S3 credentials missing — re-enter them in settings')
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

  /** S3 credentials for a registered S3 library; renderer needs these to construct S3Backend. */
  s3Creds(id: string): { accessKeyId: string; secretAccessKey: string } | null {
    const e = this.registry.get(id)
    if (!e || e.type !== 's3') return null
    return this.credentials.get(e.s3.credentialRef) ?? null
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
      registerRoot(entry.id, input.path)
      await this.markActive(entry.id)
      return this.toInfo(entry, 0)
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
    await this.markActive(entry.id)
    return this.toInfo(entry, 0)
  }

  async remove(id: string): Promise<void> {
    const entry = this.registry.get(id)
    if (!entry) return
    if (this.activeId === id) this.activeId = null
    if (entry.type === 's3') {
      await this.credentials.delete(entry.s3.credentialRef)
    } else {
      unregisterRoot(id)
    }
    await this.registry.remove(id)
  }

  async rename(id: string, newName: string): Promise<void> {
    await this.registry.update(id, { name: newName })
  }
}

// ── Legacy migration ──────────────────────────────────────────────────────

interface LegacyConfig {
  libraries: Array<{ name: string; path: string; createdAt: string }>
  active: string
}

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
