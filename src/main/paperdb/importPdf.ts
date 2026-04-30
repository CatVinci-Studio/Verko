import { copyFile, readFile } from 'fs/promises'
import { basename } from 'path'
import type { Library } from '@shared/paperdb/store'
import type { PaperDraft, PaperId } from '@shared/types'

/**
 * Import a PDF from an absolute filesystem path. Lives in the main process
 * because the source path is on the user's OS filesystem (outside the
 * library). Destination goes through the backend so it lands wherever the
 * library lives — local or S3.
 */
export async function importPdfFromFile(library: Library, filePath: string): Promise<PaperId> {
  const name = basename(filePath, '.pdf')
  const draft: PaperDraft = { title: name, tags: [] }
  const id = await library.add(draft)

  const localTarget = library.backend.localPath(`attachments/${id}.pdf`)
  if (localTarget) {
    // Same filesystem — copyFile is fast and avoids buffering in memory.
    await copyFile(filePath, localTarget)
  } else {
    const buf = await readFile(filePath)
    await library.backend.writeFile(`attachments/${id}.pdf`, buf)
  }

  await library.markPdfPresent(id)
  await library.update(id, { pdf: `attachments/${id}.pdf` })
  return id
}
