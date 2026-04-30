import type { IpcMain } from 'electron'
import { app } from 'electron'
import { getRoot } from '../scope'

/**
 * Path resolution IPC.
 * - `paths:libraryRoot(id)` returns the absolute path registered for a
 *   library — used by the renderer's IpcBackend to populate `localPath()`.
 * - `paths:userData` returns the Electron `userData` path (used to identify
 *   reserved scopes like `conversations`).
 */
export function registerPathHandlers(ipc: IpcMain): void {
  ipc.handle('paths:libraryRoot', async (_, rootId: string): Promise<string | null> => {
    return getRoot(rootId)
  })

  ipc.handle('paths:userData', async (): Promise<string> => {
    return app.getPath('userData')
  })
}
