import type { IpcMain } from 'electron'
import type { Library } from '@shared/paperdb/store'
import type { Filter, PaperId, PaperDraft, PaperPatch } from '@shared/types'

export function registerPaperHandlers(ipc: IpcMain, getLibrary: () => Library): void {
  ipc.handle('papers:list', async (_, filter?: Filter, collection?: string) => {
    try {
      const lib = getLibrary()
      return await lib.list(filter, collection)
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e))
    }
  })

  ipc.handle('papers:get', async (_, id: PaperId) => {
    try {
      const lib = getLibrary()
      return await lib.get(id)
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e))
    }
  })

  ipc.handle('papers:add', async (_, draft: PaperDraft) => {
    try {
      const lib = getLibrary()
      return await lib.add(draft)
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e))
    }
  })

  ipc.handle('papers:update', async (_, id: PaperId, patch: PaperPatch) => {
    try {
      const lib = getLibrary()
      return await lib.update(id, patch)
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e))
    }
  })

  ipc.handle('papers:delete', async (_, id: PaperId) => {
    try {
      const lib = getLibrary()
      return await lib.delete(id)
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e))
    }
  })

  ipc.handle('papers:search', async (_, query: string, filter?: Filter) => {
    try {
      const lib = getLibrary()
      return await lib.search(query, filter)
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e))
    }
  })

  ipc.handle('papers:importDoi', async (_, doi: string) => {
    try {
      const lib = getLibrary()
      return await lib.importDoi(doi)
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e))
    }
  })

  ipc.handle('papers:importPdf', async (_, filePath: string) => {
    try {
      const { importPdfFromFile } = await import('../paperdb/importPdf')
      return await importPdfFromFile(getLibrary(), filePath)
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e))
    }
  })
}
