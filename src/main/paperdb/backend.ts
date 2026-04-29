import type { Readable } from 'node:stream'

/**
 * Storage abstraction for a paper library. All paths are POSIX-style relative
 * paths from the library root (e.g. `papers/2017-vaswani.md`). Each backend
 * (local filesystem, S3, future targets) maps these onto its own naming.
 */
export interface StorageBackend {
  /** Read a file's bytes. Rejects with BackendNotFoundError if missing. */
  readFile(relPath: string): Promise<Buffer>

  /** Write a file, creating parent "directories" as needed. */
  writeFile(relPath: string, data: Buffer | string): Promise<void>

  /** Delete a file. No-op if it does not exist. */
  deleteFile(relPath: string): Promise<void>

  /** List relative paths under a prefix (recursive). Returns [] if prefix has no files. */
  listFiles(prefix: string): Promise<string[]>

  /** Existence check, used by initialization detection. */
  exists(relPath: string): Promise<boolean>

  /** Streaming read, used by the PDF viewer and other large reads. */
  createReadStream(relPath: string): Readable

  /**
   * Resolve a relative path to a real local filesystem path if one exists, or
   * `null` for backends that don't have one (S3). Used by the PDF viewer to
   * hand a `file://` URL to the renderer when possible.
   */
  localPath(relPath: string): string | null

  /** Human-readable label for logs and error messages. */
  describe(): string
}

export class BackendError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message)
    this.name = 'BackendError'
  }
}

export class BackendNotFoundError extends BackendError {
  constructor(relPath: string, cause?: unknown) {
    super(`Not found: ${relPath}`, cause)
    this.name = 'BackendNotFoundError'
  }
}

export class BackendAuthError extends BackendError {
  constructor(message: string, cause?: unknown) {
    super(`Auth: ${message}`, cause)
    this.name = 'BackendAuthError'
  }
}

export class BackendNetworkError extends BackendError {
  constructor(message: string, cause?: unknown) {
    super(`Network: ${message}`, cause)
    this.name = 'BackendNetworkError'
  }
}
