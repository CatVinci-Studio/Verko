import { app, BrowserWindow, Menu, shell, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerIpcHandlers, type AppState } from './ipc/index'
import { LibraryManager } from './paperdb/manager'
import { LibraryRegistry } from './libraries/registry'
import { CredentialStore } from './libraries/credentials'
import { AgentSession } from './agent/session'
import { buildMacMenu } from './menu'

let mainWindow: BrowserWindow | null = null

export const appState: AppState = {
  manager: null,
  agent:   null,
  get library() {
    if (!this.manager?.hasActive()) {
      throw new Error('No active library — show the welcome screen first')
    }
    return this.manager.active
  }
}

// macOS keeps a system menu bar (Cut/Copy/Paste shortcuts come from there);
// give it a curated Verko-specific layout. Windows / Linux drop the menu
// entirely — we use TitleBar + global keybinds instead.
if (process.platform === 'darwin') {
  Menu.setApplicationMenu(buildMacMenu(() => mainWindow))
} else {
  Menu.setApplicationMenu(null)
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    titleBarStyle: 'hiddenInset',
    autoHideMenuBar: true,
    backgroundColor: '#0f0f0f',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
    // Tell the renderer if we have no active library so it shows the welcome screen.
    if (!appState.manager?.hasActive()) {
      const failed = appState.manager?.getFailedLastOpen()
      mainWindow!.webContents.send('library:none', failed
        ? { reason: 'last-failed', message: failed.message }
        : { reason: 'empty' }
      )
    }
  })
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
  electronApp.setAppUserModelId('studio.catvinci.verko')
  app.on('browser-window-created', (_, w) => optimizer.watchWindowShortcuts(w))

  const registry = LibraryRegistry.fromUserData()
  const credentials = CredentialStore.fromUserData()
  appState.manager = await LibraryManager.init(registry, credentials)
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
