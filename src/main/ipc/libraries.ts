import type { IpcMain, BrowserWindow } from 'electron'
import type { LibraryManager } from '../paperdb/manager'

export function registerLibraryHandlers(
  ipc: IpcMain,
  manager: LibraryManager,
  getWindow: () => BrowserWindow | null
): void {
  ipc.handle('libraries:list', async () => {
    try {
      return await manager.list()
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e))
    }
  })

  ipc.handle('libraries:switch', async (_, name: string) => {
    try {
      await manager.switch(name)
      const libraries = await manager.list()
      const updated = libraries.find((l) => l.name === name) ?? null
      if (updated) {
        getWindow()?.webContents.send('library:switched', updated)
      }
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e))
    }
  })

  ipc.handle('libraries:add', async (_, name: string, path: string) => {
    try {
      return await manager.add(name, path)
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e))
    }
  })

  ipc.handle('libraries:create', async (_, name: string, path: string) => {
    try {
      return await manager.create(name, path)
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e))
    }
  })

  ipc.handle('libraries:remove', async (_, name: string) => {
    try {
      manager.remove(name)
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e))
    }
  })

  ipc.handle('libraries:rename', async (_, oldName: string, newName: string) => {
    try {
      manager.rename(oldName, newName)
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e))
    }
  })
}
