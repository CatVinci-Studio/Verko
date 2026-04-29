import { mkdir, readFile, writeFile, rm, readdir, stat, access } from 'fs/promises'
import { createReadStream as fsCreateReadStream } from 'fs'
import { join, dirname, relative, sep, posix } from 'path'
import type { Readable } from 'node:stream'
import type { StorageBackend } from './backend'
import { BackendError, BackendNotFoundError } from './backend'

/** Filesystem-backed StorageBackend. Root is an absolute path on disk. */
export class LocalBackend implements StorageBackend {
  constructor(public readonly root: string) {}

  private resolve(relPath: string): string {
    // Normalize POSIX-style relative paths into platform paths.
    const safe = relPath.replace(/^[\\/]+/, '')
    return join(this.root, ...safe.split('/'))
  }

  async readFile(relPath: string): Promise<Buffer> {
    try {
      return await readFile(this.resolve(relPath))
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new BackendNotFoundError(relPath, e)
      }
      throw new BackendError(`readFile failed: ${relPath}`, e)
    }
  }

  async writeFile(relPath: string, data: Buffer | string): Promise<void> {
    const full = this.resolve(relPath)
    try {
      await mkdir(dirname(full), { recursive: true })
      await writeFile(full, data)
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

  createReadStream(relPath: string): Readable {
    return fsCreateReadStream(this.resolve(relPath))
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

  /** Quick metadata for a file; returns null if missing. */
  async statRel(relPath: string): Promise<{ size: number } | null> {
    try {
      const s = await stat(this.resolve(relPath))
      return { size: s.size }
    } catch {
      return null
    }
  }
}
