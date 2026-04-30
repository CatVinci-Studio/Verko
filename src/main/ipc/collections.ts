import type { IpcMain } from 'electron'
import type { Library } from '@shared/paperdb/store'
import type { PaperId } from '@shared/types'

export function registerCollectionHandlers(ipc: IpcMain, getLibrary: () => Library): void {
  ipc.handle('collections:list', async () => {
    try { return getLibrary().listCollections() }
    catch (e) { throw new Error(e instanceof Error ? e.message : String(e)) }
  })

  ipc.handle('collections:create', async (_, name: string) => {
    try { return await getLibrary().createCollection(name) }
    catch (e) { throw new Error(e instanceof Error ? e.message : String(e)) }
  })

  ipc.handle('collections:delete', async (_, name: string) => {
    try { return await getLibrary().deleteCollection(name) }
    catch (e) { throw new Error(e instanceof Error ? e.message : String(e)) }
  })

  ipc.handle('collections:rename', async (_, oldName: string, newName: string) => {
    try { return await getLibrary().renameCollection(oldName, newName) }
    catch (e) { throw new Error(e instanceof Error ? e.message : String(e)) }
  })

  ipc.handle('collections:addPaper', async (_, id: PaperId, name: string) => {
    try { return await getLibrary().addToCollection(id, name) }
    catch (e) { throw new Error(e instanceof Error ? e.message : String(e)) }
  })

  ipc.handle('collections:removePaper', async (_, id: PaperId, name: string) => {
    try { return await getLibrary().removeFromCollection(id, name) }
    catch (e) { throw new Error(e instanceof Error ? e.message : String(e)) }
  })
}
