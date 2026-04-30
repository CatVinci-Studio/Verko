import { mkdir, readFile, rm, readdir, access } from 'fs/promises'
import { createReadStream as fsCreateReadStream } from 'fs'
import { Readable } from 'node:stream'
import { join, dirname, relative, sep, posix } from 'path'
import type { StorageBackend } from '@shared/paperdb/backend'
import { BackendError, BackendNotFoundError } from '@shared/paperdb/backend'
import { atomicWrite } from '../atomicWrite'

/** Filesystem-backed StorageBackend. Root is an absolute path on disk. */
export class LocalBackend implements StorageBackend {
  constructor(public readonly root: string) {}

  private resolve(relPath: string): string {
    // Normalize POSIX-style relative paths into platform paths.
    const safe = relPath.replace(/^[\\/]+/, '')
    return join(this.root, ...safe.split('/'))
  }

  async readFile(relPath: string): Promise<Uint8Array> {
    try {
      return await readFile(this.resolve(relPath))
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new BackendNotFoundError(relPath, e)
      }
      throw new BackendError(`readFile failed: ${relPath}`, e)
    }
  }

  async writeFile(relPath: string, data: Uint8Array | string): Promise<void> {
    const full = this.resolve(relPath)
    try {
      await mkdir(dirname(full), { recursive: true })
      await atomicWrite(full, data)
    } catch (e) {
      throw new BackendError(`writeFile failed: ${relPath}`, e)
    }
  }

  async deleteFile(relPath: string): Promise<void> {
    try {
      await rm(this.resolve(relPath), { force: true })
    } catch (e) {
      throw new BackendError(`deleteFile failed: ${relPath}`, e)
    }
  }

  async listFiles(prefix: string): Promise<string[]> {
    const base = this.resolve(prefix || '.')
    const out: string[] = []
    try {
      await this.walk(base, out)
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw new BackendError(`listFiles failed: ${prefix}`, e)
    }
    return out
      .map((abs) => relative(this.root, abs).split(sep).join(posix.sep))
      .sort()
  }

  private async walk(dir: string, acc: string[]): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const e of entries) {
      const p = join(dir, e.name)
      if (e.isDirectory()) {
        await this.walk(p, acc)
      } else if (e.isFile()) {
        acc.push(p)
      }
    }
  }

  async exists(relPath: string): Promise<boolean> {
    try {
      await access(this.resolve(relPath))
      return true
    } catch {
      return false
    }
  }

  createReadStream(relPath: string): ReadableStream<Uint8Array> {
    // Adapt Node's Readable to a Web ReadableStream so the StorageBackend
    // interface stays platform-neutral.
    return Readable.toWeb(fsCreateReadStream(this.resolve(relPath))) as ReadableStream<Uint8Array>
  }

  localPath(relPath: string): string | null {
    return this.resolve(relPath)
  }

  describe(): string {
    return `local: ${this.root}`
  }

  /** Convenience helper used by manager.create/init to ensure the root exists. */
  async ensureRoot(): Promise<void> {
    await mkdir(this.root, { recursive: true })
  }
}
