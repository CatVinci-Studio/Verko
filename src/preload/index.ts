import { contextBridge, ipcRenderer } from 'electron'
import type { IpcChannels, LibraryInfo, LibraryNonePayload } from '@shared/types'

type UnsubFn = () => void

const api = {
  // ── Typed invoke helper ──────────────────────────────────────────────────
  invoke<K extends keyof IpcChannels>(
    channel: K,
    ...args: IpcChannels[K]['args']
  ): Promise<IpcChannels[K]['ret']> {
    return ipcRenderer.invoke(channel, ...args)
  },

  // ── Shortcuts / convenience ──────────────────────────────────────────────
  libraries: {
    list:        ()                                            => api.invoke('libraries:list'),
    open:        (id: string)                                  => api.invoke('libraries:open', id),
    add:         (input: IpcChannels['libraries:add']['args'][0]) => api.invoke('libraries:add', input),
    remove:      (id: string)                                  => api.invoke('libraries:remove', id),
    rename:      (id: string, name: string)                    => api.invoke('libraries:rename', id, name),
    pickFolder:  ()                                            => api.invoke('libraries:pickFolder'),
    probeLocal:  (path: string)                                => api.invoke('libraries:probeLocal', path),
    probeS3:     (cfg: IpcChannels['libraries:probeS3']['args'][0]) => api.invoke('libraries:probeS3', cfg),
    hasNone:     ()                                            => api.invoke('libraries:hasNone'),
    exportZip:   (id: string)                                  => api.invoke('libraries:exportZip', id),
    importZip:   ()                                            => api.invoke('libraries:importZip'),
    onSwitched: (cb: (info: LibraryInfo) => void): UnsubFn => {
      const listener = (_: Electron.IpcRendererEvent, info: LibraryInfo) => cb(info)
      ipcRenderer.on('library:switched', listener)
      return () => ipcRenderer.removeListener('library:switched', listener)
    },
    onNone: (cb: (payload: LibraryNonePayload) => void): UnsubFn => {
      const listener = (_: Electron.IpcRendererEvent, payload: LibraryNonePayload) => cb(payload)
      ipcRenderer.on('library:none', listener)
      return () => ipcRenderer.removeListener('library:none', listener)
    },
  },

  papers: {
    list:      (filter?: IpcChannels['papers:list']['args'][0], collection?: string) => api.invoke('papers:list', filter, collection),
    get:       (id: string)                                        => api.invoke('papers:get', id),
    add:       (draft: IpcChannels['papers:add']['args'][0])       => api.invoke('papers:add', draft),
    update:    (id: string, patch: IpcChannels['papers:update']['args'][1]) => api.invoke('papers:update', id, patch),
    delete:    (id: string)                                        => api.invoke('papers:delete', id),
    search:    (q: string, filter?: IpcChannels['papers:search']['args'][1]) => api.invoke('papers:search', q, filter),
    importDoi: (doi: string)                                       => api.invoke('papers:importDoi', doi),
    importPdf: (path: string)                                      => api.invoke('papers:importPdf', path),
  },

  schema: {
    get:          ()                                                => api.invoke('schema:get'),
    addColumn:    (col: IpcChannels['schema:addColumn']['args'][0]) => api.invoke('schema:addColumn', col),
    removeColumn: (name: string)                                    => api.invoke('schema:removeColumn', name),
    renameColumn: (from: string, to: string)                       => api.invoke('schema:renameColumn', from, to),
  },

  agent: {
    send: (
      message: string,
      attachments?: import('@shared/types').ChatContentPart[],
      paperId?: string,
      language?: import('@shared/types').Language,
      conversationId?: string,
    ) => api.invoke('agent:send', message, attachments, paperId, language, conversationId),
    abort: (conversationId?: string) => api.invoke('agent:abort', conversationId),
    getConfig: () => api.invoke('agent:getConfig'),
    setProfile: (name: string) => api.invoke('agent:setProfile', name),
    updateProfile: (name: string, patch: import('@shared/types').ProfilePatch) =>
                                                          api.invoke('agent:updateProfile', name, patch),
    saveKey: (profile: string, key: string, remember: boolean) => api.invoke('agent:saveKey', profile, key, remember),
    testKey: (profile: string) => api.invoke('agent:testKey', profile),
    getProfiles: () => api.invoke('agent:getProfiles'),
    onEvent: (cb: (envelope: import('@shared/types').AgentEventEnvelope) => void) => {
      const listener = (_: Electron.IpcRendererEvent, env: import('@shared/types').AgentEventEnvelope) => cb(env)
      ipcRenderer.on('agent:event', listener)
      return () => ipcRenderer.removeListener('agent:event', listener)
    },
  },

  conversations: {
    list:   () => api.invoke('conversations:list'),
    get:    (id: string) => api.invoke('conversations:get', id),
    create: (title?: string) => api.invoke('conversations:create', title),
    rename: (id: string, title: string) => api.invoke('conversations:rename', id, title),
    delete: (id: string) => api.invoke('conversations:delete', id),
  },

  collections: {
    list:        ()                                   => api.invoke('collections:list'),
    create:      (name: string)                       => api.invoke('collections:create', name),
    delete:      (name: string)                       => api.invoke('collections:delete', name),
    rename:      (oldName: string, newName: string)   => api.invoke('collections:rename', oldName, newName),
    addPaper:    (id: string, name: string)           => api.invoke('collections:addPaper', id, name),
    removePaper: (id: string, name: string)           => api.invoke('collections:removePaper', id, name),
  },

  pdf: {
    getPath: (id: string) => api.invoke('pdf:getPath', id),
  },

  app: {
    platform: process.platform as NodeJS.Platform,
    onMenuCommand: (cb: (cmd: string) => void): UnsubFn => {
      const listener = (_: Electron.IpcRendererEvent, cmd: string) => cb(cmd)
      ipcRenderer.on('app:menu-command', listener)
      return () => ipcRenderer.removeListener('app:menu-command', listener)
    },
  },

  window: {
    minimize:       () => ipcRenderer.send('window:minimize'),
    toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
    close:          () => ipcRenderer.send('window:close'),
    onMaximized: (cb: (maximized: boolean) => void): UnsubFn => {
      const listener = (_: Electron.IpcRendererEvent, max: boolean) => cb(max)
      ipcRenderer.on('window:maximized', listener)
      return () => ipcRenderer.removeListener('window:maximized', listener)
    },
  },
}

contextBridge.exposeInMainWorld('api', api)
