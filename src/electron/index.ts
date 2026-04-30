import { app, BrowserWindow, Menu, shell, ipcMain } from 'electron'
import { join } from 'path'
import { mkdir } from 'fs/promises'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerIpcHandlers, type AppState } from './ipc/index'
import { LibraryManager } from './paperdb/libraryManager'
import { LibraryRegistry } from './libraries/registry'
import { CredentialStore } from './libraries/credentials'
import { registerRoot } from './scope'
import { buildMacMenu } from './menu'

export const CONVERSATIONS_ROOT = 'conversations'
export const TRANSCRIPTS_ROOT   = 'transcripts'

let mainWindow: BrowserWindow | null = null

export const appState: AppState = {
  manager: null,
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
    // macOS: traffic lights inset; Windows/Linux: frameless (we draw our own controls)
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
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

  // Register the renderer's conversation store as a zero-trust scope.
  // Path matches the previous main-side ConversationStore so existing
  // users keep their history.
  const convDir = join(app.getPath('userData'), 'conversations')
  await mkdir(convDir, { recursive: true })
  registerRoot(CONVERSATIONS_ROOT, convDir)

  // Pre-compaction transcripts get archived here so the user can scroll
  // back through "what got compressed" if they want.
  const transcriptsDir = join(app.getPath('userData'), 'transcripts')
  await mkdir(transcriptsDir, { recursive: true })
  registerRoot(TRANSCRIPTS_ROOT, transcriptsDir)

  registerIpcHandlers(ipcMain, appState, mainWindow)

  // Frameless window controls — used by the custom titlebar on Windows/Linux.
  ipcMain.on('window:minimize',        () => mainWindow?.minimize())
  ipcMain.on('window:toggle-maximize', () => {
    if (!mainWindow) return
    if (mainWindow.isMaximized()) mainWindow.unmaximize()
    else mainWindow.maximize()
  })
  ipcMain.on('window:close',           () => mainWindow?.close())

  // Push maximize state to the renderer so the maximize icon can swap.
  const sendMaxState = () => mainWindow?.webContents.send('window:maximized', mainWindow?.isMaximized() ?? false)
  app.on('browser-window-created', (_, w) => {
    w.on('maximize',   sendMaxState)
    w.on('unmaximize', sendMaxState)
  })

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

export { mainWindow }
