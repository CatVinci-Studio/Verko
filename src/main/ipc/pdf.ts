import type { IpcMain } from 'electron'
import type { Library } from '@shared/paperdb/store'
import type { PaperId } from '@shared/types'

export function registerPdfHandlers(ipc: IpcMain, getLibrary: () => Library): void {
  ipc.handle('pdf:getPath', async (_, id: PaperId) => {
    try {
      const lib = getLibrary()
      return lib.pdfPath(id)
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e))
    }
  })
}
