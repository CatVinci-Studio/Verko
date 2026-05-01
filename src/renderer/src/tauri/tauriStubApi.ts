import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import type { IApi } from '@/lib/ipc'

// Stage-1 PoC stub. The Rust shim only exposes `ping` so far; everything else
// throws. The point is to verify the renderer loads inside a Tauri WebView and
// that the IPC bridge round-trips. Stage 2 replaces this with real adapters
// that call into the ported Rust IO commands.

const NOT_IMPLEMENTED = (label: string) => () => {
  throw new Error(
    `Verko: ${label} not implemented in Tauri runtime yet (stage 1 PoC).`,
  )
}

const noopUnsub = () => () => {}

export async function tauriPing(): Promise<string> {
  return invoke<string>('ping')
}

export const tauriStubApi: IApi = {
  libraries: {
    list: NOT_IMPLEMENTED('libraries.list'),
    open: NOT_IMPLEMENTED('libraries.open'),
    add: NOT_IMPLEMENTED('libraries.add'),
    remove: NOT_IMPLEMENTED('libraries.remove'),
    rename: NOT_IMPLEMENTED('libraries.rename'),
    pickFolder: NOT_IMPLEMENTED('libraries.pickFolder'),
    probeLocal: NOT_IMPLEMENTED('libraries.probeLocal'),
    probeS3: NOT_IMPLEMENTED('libraries.probeS3'),
    hasNone: NOT_IMPLEMENTED('libraries.hasNone'),
    exportZip: NOT_IMPLEMENTED('libraries.exportZip'),
    importZip: NOT_IMPLEMENTED('libraries.importZip'),
    onSwitched: noopUnsub,
    onNone: noopUnsub,
  },
  collections: {
    list: NOT_IMPLEMENTED('collections.list'),
    create: NOT_IMPLEMENTED('collections.create'),
    delete: NOT_IMPLEMENTED('collections.delete'),
    rename: NOT_IMPLEMENTED('collections.rename'),
    addPaper: NOT_IMPLEMENTED('collections.addPaper'),
    removePaper: NOT_IMPLEMENTED('collections.removePaper'),
  },
  papers: {
    list: NOT_IMPLEMENTED('papers.list'),
    get: NOT_IMPLEMENTED('papers.get'),
    add: NOT_IMPLEMENTED('papers.add'),
    update: NOT_IMPLEMENTED('papers.update'),
    delete: NOT_IMPLEMENTED('papers.delete'),
    search: NOT_IMPLEMENTED('papers.search'),
    importArxiv: NOT_IMPLEMENTED('papers.importArxiv'),
    importPdf: NOT_IMPLEMENTED('papers.importPdf'),
  },
  schema: {
    get: NOT_IMPLEMENTED('schema.get'),
    addColumn: NOT_IMPLEMENTED('schema.addColumn'),
    removeColumn: NOT_IMPLEMENTED('schema.removeColumn'),
    renameColumn: NOT_IMPLEMENTED('schema.renameColumn'),
  },
  agent: {
    send: NOT_IMPLEMENTED('agent.send'),
    abort: NOT_IMPLEMENTED('agent.abort'),
    compact: NOT_IMPLEMENTED('agent.compact'),
    getConfig: NOT_IMPLEMENTED('agent.getConfig'),
    setProfile: NOT_IMPLEMENTED('agent.setProfile'),
    updateProfile: NOT_IMPLEMENTED('agent.updateProfile'),
    saveKey: NOT_IMPLEMENTED('agent.saveKey'),
    loadKey: NOT_IMPLEMENTED('agent.loadKey'),
    testKey: NOT_IMPLEMENTED('agent.testKey'),
    getProfiles: NOT_IMPLEMENTED('agent.getProfiles'),
    onEvent: noopUnsub,
  },
  conversations: {
    list: NOT_IMPLEMENTED('conversations.list'),
    get: NOT_IMPLEMENTED('conversations.get'),
    create: NOT_IMPLEMENTED('conversations.create'),
    rename: NOT_IMPLEMENTED('conversations.rename'),
    delete: NOT_IMPLEMENTED('conversations.delete'),
    append: NOT_IMPLEMENTED('conversations.append'),
  },
  pdf: {
    getPath: NOT_IMPLEMENTED('pdf.getPath'),
  },
  fs: {
    read: NOT_IMPLEMENTED('fs.read'),
    write: NOT_IMPLEMENTED('fs.write'),
    delete: NOT_IMPLEMENTED('fs.delete'),
    list: NOT_IMPLEMENTED('fs.list'),
    exists: NOT_IMPLEMENTED('fs.exists'),
  },
  paths: {
    libraryRoot: NOT_IMPLEMENTED('paths.libraryRoot'),
  },
  app: {
    platform: 'linux',
    onMenuCommand: noopUnsub,
  },
  window: {
    minimize: () => { void getCurrentWindow().minimize() },
    toggleMaximize: () => { void getCurrentWindow().toggleMaximize() },
    close: () => { void getCurrentWindow().close() },
    onMaximized: (cb) => {
      const w = getCurrentWindow()
      const unlistenP = w.onResized(async () => {
        cb(await w.isMaximized())
      })
      return () => { void unlistenP.then((u) => u()) }
    },
  },
}
