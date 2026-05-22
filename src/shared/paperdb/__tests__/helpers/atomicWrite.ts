import { writeFile, rename, unlink } from 'fs/promises'
import { randomBytes } from 'crypto'

/** Test-only: atomic file write via tmp + rename. Mirrors the Rust impl. */
export async function atomicWrite(abs: string, data: Uint8Array | string): Promise<void> {
  const tmp = `${abs}.${randomBytes(6).toString('hex')}.tmp`
  try {
    await writeFile(tmp, data)
    await rename(tmp, abs)
  } catch (e) {
    await unlink(tmp).catch(() => {})
    throw e
  }
}
