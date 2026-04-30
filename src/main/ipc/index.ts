import type { IpcMain, BrowserWindow } from 'electron'
import type { LibraryManager } from '../paperdb/manager'
import type { Library } from '@shared/paperdb/store'
import type { AgentSession } from './agent'
import { registerLibraryHandlers } from './libraries'
import { registerPaperHandlers } from './papers'
import { registerSchemaHandlers } from './schema'
import { registerAgentHandlers } from './agent'
import { registerConversationHandlers } from './conversations'
import { registerPdfHandlers } from './pdf'
import { registerCollectionHandlers } from './collections'

export interface AppState {
  manager: LibraryManager | null
  agent: AgentSession | null
  readonly library: Library
}

export function registerIpcHandlers(
  ipc: IpcMain,
  appState: AppState,
  mainWindow: BrowserWindow | null
): void {
  const getWindow = () => mainWindow
  const getLib = () => appState.library

  registerLibraryHandlers(ipc, appState.manager!, getWindow)
  registerPaperHandlers(ipc, getLib)
  registerSchemaHandlers(ipc, getLib)
  registerCollectionHandlers(ipc, getLib)
  registerAgentHandlers(ipc, () => appState.agent!, getWindow)
  registerConversationHandlers(ipc, () => appState.agent!)
  registerPdfHandlers(ipc, getLib)
}
