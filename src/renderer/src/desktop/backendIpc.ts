import {
  type StorageBackend,
  BackendError,
  BackendNotFoundError,
} from '@shared/paperdb/backend'

interface IpcBackendDeps {
  fs: {
    read(rootId: string, rel: string): Promise<Uint8Array>
    write(rootId: string, rel: string, data: Uint8Array | string): Promise<void>
    delete(rootId: string, rel: string): Promise<void>
    list(rootId: string, prefix: string): Promise<string[]>
    exists(rootId: string, rel: string): Promise<boolean>
  }
  paths: {
    libraryRoot(id: string): Promise<string | null>
  }
}

/**
 * Desktop StorageBackend that proxies through zero-trust `fs:*` IPC.
 * Constructed with the library's `rootId` (its registry id) — main maps
 * that back to an absolute path before any syscall.
 */
export class IpcBackend implements StorageBackend {
  private rootPath: string | null = null

  constructor(
    private readonly api: IpcBackendDeps,
    public readonly rootId: string,
  ) {}

  async readFile(relPath: string): Promise<Uint8Array> {
    try {
      return await this.api.fs.read(this.rootId, relPath)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('ENOENT') || msg.includes('Not found')) {
        throw new BackendNotFoundError(relPath, e)
      }
      throw new BackendError(`readFile failed: ${relPath}`, e)
    }
  }

  async writeFile(relPath: string, data: Uint8Array | string): Promise<void> {
    try {
      await this.api.fs.write(this.rootId, relPath, data)
    } catch (e) {
      throw new BackendError(`writeFile failed: ${relPath}`, e)
    }
  }

  async deleteFile(relPath: string): Promise<void> {
    try {
      await this.api.fs.delete(this.rootId, relPath)
    } catch (e) {
      throw new BackendError(`deleteFile failed: ${relPath}`, e)
    }
  }

  async listFiles(prefix: string): Promise<string[]> {
    try {
      return await this.api.fs.list(this.rootId, prefix || '.')
    } catch (e) {
      throw new BackendError(`listFiles failed: ${prefix}`, e)
    }
  }

  async exists(relPath: string): Promise<boolean> {
    return this.api.fs.exists(this.rootId, relPath)
  }

  /**
   * Wrap `readFile` in a single-chunk ReadableStream. PDFs in this product
   * are tens of MB at most; chunked streaming over IPC isn't worth the
   * machinery yet.
   */
  createReadStream(relPath: string): ReadableStream<Uint8Array> {
    const api = this.api
    const rootId = this.rootId
    return new ReadableStream({
      async start(controller) {
        try {
          const bytes = await api.fs.read(rootId, relPath)
          controller.enqueue(bytes)
          controller.close()
        } catch (e) {
          controller.error(e)
        }
      },
    })
  }

  localPath(relPath: string): string | null {
    if (!this.rootPath) return null
    // Posix join — desktop renderer only uses this for `file://` URLs which
    // accept either separator style.
    return relPath ? `${this.rootPath}/${relPath}` : this.rootPath
  }

  /**
   * Asynchronously cache the absolute root so `localPath` can return a
   * useful answer. Call once after construction.
   */
  async resolveRootPath(): Promise<void> {
    this.rootPath = await this.api.paths.libraryRoot(this.rootId)
  }

  describe(): string {
    return `local: ${this.rootPath ?? this.rootId}`
  }
}
