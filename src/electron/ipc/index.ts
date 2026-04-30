import type { IpcMain, BrowserWindow } from 'electron'
import type { LibraryManager } from '../paperdb/libraryManager'
import { registerLibraryHandlers } from './libraries'
import { registerAgentHandlers } from './agent'
import { registerFsHandlers } from './fs'
import { registerPathHandlers } from './paths'
import { registerDialogHandlers } from './dialog'

export interface AppState {
  manager: LibraryManager | null
}

export function registerIpcHandlers(
  ipc: IpcMain,
  appState: AppState,
  mainWindow: BrowserWindow | null
): void {
  const getWindow = () => mainWindow

  registerLibraryHandlers(ipc, appState.manager!, getWindow)
  registerAgentHandlers(ipc)
  registerFsHandlers(ipc)
  registerPathHandlers(ipc)
  registerDialogHandlers(ipc, getWindow)
}
