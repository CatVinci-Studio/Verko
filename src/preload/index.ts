import { contextBridge, ipcRenderer } from 'electron'
import type { IpcChannels, AgentEvent } from '@shared/types'

type UnsubFn = () => void

const api = {
  // ── Typed invoke helper ──────────────────────────────────────────────────
  invoke<K extends keyof IpcChannels>(
    channel: K,
    ...args: IpcChannels[K]['args']
  ): Promise<IpcChannels[K]['ret']> {
    return ipcRenderer.invoke(channel, ...args)
  },

  // ── Streaming agent events ───────────────────────────────────────────────
  onAgentEvent(cb: (event: AgentEvent) => void): UnsubFn {
    const listener = (_: Electron.IpcRendererEvent, event: AgentEvent) => cb(event)
    ipcRenderer.on('agent:event', listener)
    return () => ipcRenderer.removeListener('agent:event', listener)
  },

  // ── Shortcuts / convenience ──────────────────────────────────────────────
  libraries: {
    list:    ()                                 => api.invoke('libraries:list'),
    switch:  (name: string)                     => api.invoke('libraries:switch', name),
    add:     (name: string, path: string)       => api.invoke('libraries:add', name, path),
    create:  (name: string, path: string)       => api.invoke('libraries:create', name, path),
    remove:  (name: string)                     => api.invoke('libraries:remove', name),
    rename:  (oldName: string, newName: string) => api.invoke('libraries:rename', oldName, newName),
    onSwitched: (cb: (info: import('@shared/types').LibraryInfo) => void) => {
      const listener = (_: Electron.IpcRendererEvent, info: import('@shared/types').LibraryInfo) => cb(info)
      ipcRenderer.on('library:switched', listener)
      return () => ipcRenderer.removeListener('library:switched', listener)
    }
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
    send:        (message: string, paperId?: string) => api.invoke('agent:send', message, paperId),
    abort:       ()                                   => api.invoke('agent:abort'),
    getConfig:   ()                                   => api.invoke('agent:getConfig'),
    setProfile:  (name: string)                       => api.invoke('agent:setProfile', name),
    saveKey:     (profile: string, key: string)       => api.invoke('agent:saveKey', profile, key),
    testKey:     (profile: string)                    => api.invoke('agent:testKey', profile),
    getProfiles: ()                                   => api.invoke('agent:getProfiles'),
    onEvent:     (cb: (event: AgentEvent) => void)    => api.onAgentEvent(cb),
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
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
