import type { IpcMain } from 'electron'
import { mkdir, readFile, rm, readdir, access } from 'fs/promises'
import path from 'path'
import { resolveScoped, getRoot } from '../scope'
import { atomicWrite } from '../atomicWrite'

/**
 * Zero-trust filesystem IPC. All paths come in as `(rootId, relPath)` and
 * are validated by `resolveScoped` before any fs syscall.
 */
export function registerFsHandlers(ipc: IpcMain): void {
  ipc.handle('fs:read', async (_, rootId: string, rel: string): Promise<Uint8Array> => {
    const abs = await resolveScoped(rootId, rel)
    const buf = await readFile(abs)
    // Return a plain Uint8Array (not a Buffer) so the renderer-side type matches.
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
  })

  ipc.handle('fs:write', async (_, rootId: string, rel: string, data: Uint8Array | string) => {
    const abs = await resolveScoped(rootId, rel)
    await mkdir(path.dirname(abs), { recursive: true })
    await atomicWrite(abs, data instanceof Uint8Array ? Buffer.from(data) : data)
  })

  ipc.handle('fs:delete', async (_, rootId: string, rel: string) => {
    const abs = await resolveScoped(rootId, rel)
    await rm(abs, { force: true })
  })

  ipc.handle('fs:list', async (_, rootId: string, prefix: string): Promise<string[]> => {
    const root = getRoot(rootId)
    if (!root) throw new Error(`Root not allowed: ${rootId}`)
    const base = await resolveScoped(rootId, prefix || '.')
    const out: string[] = []
    try {
      await walk(base, out)
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw e
    }
    return out
      .map((abs) => path.relative(root, abs).split(path.sep).join('/'))
      .sort()
  })

  ipc.handle('fs:exists', async (_, rootId: string, rel: string): Promise<boolean> => {
    try {
      const abs = await resolveScoped(rootId, rel)
      await access(abs)
      return true
    } catch {
      return false
    }
  })
}

async function walk(dir: string, acc: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) await walk(p, acc)
    else if (e.isFile()) acc.push(p)
  }
}
