import { app, Menu, shell, BrowserWindow } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'

/**
 * Custom macOS menu bar. Mac apps are expected to have one — and Cut /
 * Copy / Paste keyboard shortcuts come from the Edit menu's role-based
 * items, so we can't just remove the menu the way we do on Windows/Linux.
 *
 * Every Verko-specific item sends a string command to the focused window
 * over `app:menu-command`; the renderer listens once and dispatches to
 * its existing UI handlers. Accelerators are advisory — Electron consumes
 * them before they reach the renderer, so commands fire from menu shortcuts
 * AND from the renderer's own keydown listener identically.
 */
export function buildMacMenu(getWindow: () => BrowserWindow | null): Menu {
  const send = (cmd: string) => () => {
    getWindow()?.webContents.send('app:menu-command', cmd)
  }

  const template: MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { label: 'Settings…', accelerator: 'Cmd+,', click: send('open-settings') },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'File',
      submenu: [
        { label: 'New Conversation', accelerator: 'Cmd+N', click: send('new-conversation') },
        { type: 'separator' },
        { label: 'Find in Library', accelerator: 'Cmd+F', click: send('open-filter') },
        { label: 'Command Palette', accelerator: 'Cmd+K', click: send('open-command-palette') },
        { type: 'separator' },
        { role: 'close' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        { role: 'delete' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Toggle Sidebar', accelerator: 'Cmd+\\', click: send('toggle-sidebar') },
        { label: 'Toggle Agent',   accelerator: 'Cmd+.',  click: send('toggle-agent') },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Documentation',
          click: () => { void shell.openExternal('https://github.com/CatVinci-Studio/Verko') },
        },
        {
          label: 'Report an Issue',
          click: () => { void shell.openExternal('https://github.com/CatVinci-Studio/Verko/issues/new') },
        },
      ],
    },
  ]

  return Menu.buildFromTemplate(template)
}
