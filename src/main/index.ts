import { app, BrowserWindow, shell, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerIpcHandlers, type AppState } from './ipc/index'
import { LibraryManager } from './paperdb/manager'
import { AgentSession } from './agent/session'
import { homedir } from 'os'

let mainWindow: BrowserWindow | null = null

export const appState: AppState = {
  manager: null,
  agent:   null,
  get library() { return this.manager!.active }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0f0f0f',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow!.show())
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.paperwithagent')
  app.on('browser-window-created', (_, w) => optimizer.watchWindowShortcuts(w))

  const defaultLibPath = join(homedir(), 'PaperwithAgent', 'library')
  appState.manager = await LibraryManager.init(defaultLibPath)
  appState.agent   = new AgentSession(appState)

  registerIpcHandlers(ipcMain, appState, mainWindow)

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

export { mainWindow }
