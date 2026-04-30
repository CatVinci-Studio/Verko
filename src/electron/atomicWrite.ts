import { writeFile, rename, unlink } from 'fs/promises'
import { randomBytes } from 'crypto'

/**
 * Atomic file write: write to a temp sibling, then `rename` onto the target.
 *
 * `rename` is atomic on POSIX filesystems (same filesystem) and effectively
 * atomic on NTFS. A reader either sees the prior contents or the new
 * contents, never a half-written file. Eliminates the "papers.csv truncated
 * by power loss" failure mode.
 */
export async function atomicWrite(abs: string, data: Uint8Array | string): Promise<void> {
  const tmp = `${abs}.${randomBytes(6).toString('hex')}.tmp`
  try {
    await writeFile(tmp, data)
    await rename(tmp, abs)
  } catch (e) {
    // Best-effort cleanup of orphan temp.
    await unlink(tmp).catch(() => {})
    throw e
  }
}
