import { promises as fs } from 'fs'
import { dirname, join } from 'path'
import JSZip from 'jszip'
import type { StorageBackend } from '@shared/paperdb/backend'

/**
 * Export the entire contents of a library to a single .zip archive.
 */
export async function exportLibraryZip(backend: StorageBackend, outPath: string): Promise<void> {
  const zip = new JSZip()
  const all = await backend.listFiles('')
  for (const rel of all) {
    const data = await backend.readFile(rel)
    zip.file(rel, data)
  }
  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  await fs.mkdir(dirname(outPath), { recursive: true })
  await fs.writeFile(outPath, buf)
}

/**
 * Extract a library zip into `targetDir`. The directory must be empty
 * or non-existent — we refuse to overlay onto a populated folder to avoid
 * silently merging libraries.
 *
 * Returns the resolved target directory.
 */
export async function importLibraryZip(zipPath: string, targetDir: string): Promise<string> {
  // Refuse if target exists and is non-empty.
  try {
    const existing = await fs.readdir(targetDir)
    if (existing.length > 0) {
      throw new Error(`Target directory is not empty: ${targetDir}`)
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
  }

  await fs.mkdir(targetDir, { recursive: true })

  const data = await fs.readFile(zipPath)
  const zip = await JSZip.loadAsync(data)

  // Sanity check: must contain schema.md to be a valid library archive.
  if (!zip.file('schema.md')) {
    throw new Error('Not a valid library archive (schema.md missing).')
  }

  const entries = Object.values(zip.files).filter((f) => !f.dir)
  for (const entry of entries) {
    const buf = await entry.async('nodebuffer')
    const dest = join(targetDir, entry.name)
    await fs.mkdir(dirname(dest), { recursive: true })
    await fs.writeFile(dest, buf)
  }

  return targetDir
}
