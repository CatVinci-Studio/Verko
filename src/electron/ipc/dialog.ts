import { dialog } from 'electron'
import type { IpcMain, BrowserWindow } from 'electron'
import { readFile } from 'fs/promises'
import { basename } from 'path'

/**
 * Filesystem dialogs that return data, not paths. Lets the renderer ingest
 * an arbitrary user-chosen file (e.g. for PDF import) without ever seeing
 * a path outside the zero-trust scope.
 */
export function registerDialogHandlers(
  ipc: IpcMain,
  getWindow: () => BrowserWindow | null,
): void {
  ipc.handle('dialog:openPdf', async (): Promise<{ filename: string; bytes: Uint8Array } | null> => {
    const win = getWindow()
    const res = await dialog.showOpenDialog(win!, {
      title: 'Import PDF',
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
      properties: ['openFile'],
    })
    if (res.canceled || res.filePaths.length === 0) return null
    const p = res.filePaths[0]
    const buf = await readFile(p)
    return {
      filename: basename(p, '.pdf'),
      bytes: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength),
    }
  })
}
