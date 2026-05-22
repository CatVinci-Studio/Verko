import { Library } from '@shared/paperdb/store'
import { S3Backend } from '@shared/paperdb/backendS3'
import type { LibraryInfo } from '@shared/types'
import { IpcBackend } from './backendIpc'
import type { IShellApi } from './shellApi'

/**
 * Owns the active `Library` instance on the desktop renderer. Listens for
 * `library:switched` from main and rebuilds with the appropriate backend
 * (IpcBackend for local, S3Backend for S3).
 *
 * Concurrency: a single `libPromise` represents the current Library. It's
 * replaced *synchronously* on every switch so any caller of `ensure()` —
 * including ones that fire from `App`'s own `library:switched` handler —
 * gets the new Library, not a stale one. Concurrent `ensure()` calls during
 * bootstrap or switch all await the same in-flight open.
 */
export class LibraryHost {
  private libPromise: Promise<Library | null> | null = null
  private lib: Library | null = null
  private activeInfo: LibraryInfo | null = null
  private listeners = new Set<(lib: Library | null, info: LibraryInfo | null) => void>()

  constructor(private readonly api: IShellApi) {
    api.libraries.onSwitched((info) => this.switchTo(info))
  }

  ensure(): Promise<Library | null> {
    if (!this.libPromise) this.libPromise = this.bootstrap()
    return this.libPromise
  }

  current(): Library | null {
    return this.lib
  }

  currentInfo(): LibraryInfo | null {
    return this.activeInfo
  }

  onChange(cb: (lib: Library | null, info: LibraryInfo | null) => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  private async bootstrap(): Promise<Library | null> {
    const list = await this.api.libraries.list()
    const active = list.find((l) => l.active) ?? null
    if (!active) {
      this.activeInfo = null
      this.lib = null
      return null
    }
    this.activeInfo = active
    return this.openBackend(active)
  }

  /** Synchronous: replaces `libPromise` so subsequent `ensure()` gets the new lib. */
  private switchTo(info: LibraryInfo): void {
    this.activeInfo = info
    this.libPromise = this.openBackend(info)
  }

  private async openBackend(info: LibraryInfo): Promise<Library | null> {
    let lib: Library | null
    try {
      if (info.kind === 'local') {
        const backend = new IpcBackend(this.api, info.id)
        await backend.resolveRootPath()
        lib = await Library.open(backend)
      } else {
        const creds = await this.api.libraries.s3Creds(info.id)
        if (!creds) throw new Error('S3 credentials missing — re-enter them in settings')
        const backend = new S3Backend({
          endpoint: info.endpoint,
          region: info.region,
          bucket: info.bucket,
          prefix: info.prefix,
          accessKeyId: creds.accessKeyId,
          secretAccessKey: creds.secretAccessKey,
        })
        lib = await Library.open(backend)
      }
    } catch (e) {
      console.error('Failed to open library', info.id, e)
      lib = null
    }
    this.lib = lib
    for (const cb of this.listeners) cb(lib, info)
    return lib
  }

  describe(): { libraryName: string; libraryRoot: string } {
    if (!this.activeInfo) return { libraryName: 'My Library', libraryRoot: '(no library)' }
    const root =
      this.activeInfo.kind === 's3'
        ? `s3://${this.activeInfo.bucket}${this.activeInfo.prefix ? '/' + this.activeInfo.prefix : ''}`
        : this.activeInfo.path
    return { libraryName: this.activeInfo.name, libraryRoot: root }
  }
}
