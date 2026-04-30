import type { IpcMain } from 'electron'
import type { Library } from '@shared/paperdb/store'
import type { Column } from '@shared/types'

export function registerSchemaHandlers(ipc: IpcMain, getLibrary: () => Library): void {
  ipc.handle('schema:get', async () => {
    try {
      const lib = getLibrary()
      return lib.schema()
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e))
    }
  })

  ipc.handle('schema:addColumn', async (_, col: Column) => {
    try {
      const lib = getLibrary()
      return await lib.addColumn(col)
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e))
    }
  })

  ipc.handle('schema:removeColumn', async (_, name: string) => {
    try {
      const lib = getLibrary()
      return await lib.removeColumn(name)
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e))
    }
  })

  ipc.handle('schema:renameColumn', async (_, from: string, to: string) => {
    try {
      const lib = getLibrary()
      return await lib.renameColumn(from, to)
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e))
    }
  })
}
