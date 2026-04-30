import { contextBridge, ipcRenderer } from 'electron'
import type { IpcChannels, LibraryInfo, LibraryNonePayload } from '@shared/types'

type UnsubFn = () => void

const api = {
  invoke<K extends keyof IpcChannels>(
    channel: K,
    ...args: IpcChannels[K]['args']
  ): Promise<IpcChannels[K]['ret']> {
    return ipcRenderer.invoke(channel, ...args)
  },

  libraries: {
    list:        ()                                               => api.invoke('libraries:list'),
    open:        (id: string)                                     => api.invoke('libraries:open', id),
    add:         (input: IpcChannels['libraries:add']['args'][0]) => api.invoke('libraries:add', input),
    remove:      (id: string)                                     => api.invoke('libraries:remove', id),
    rename:      (id: string, name: string)                       => api.invoke('libraries:rename', id, name),
    pickFolder:  ()                                               => api.invoke('libraries:pickFolder'),
    probeLocal:  (path: string)                                   => api.invoke('libraries:probeLocal', path),
    probeS3:     (cfg: IpcChannels['libraries:probeS3']['args'][0]) => api.invoke('libraries:probeS3', cfg),
    hasNone:     ()                                               => api.invoke('libraries:hasNone'),
    exportZip:   (id: string)                                     => api.invoke('libraries:exportZip', id),
    importZip:   ()                                               => api.invoke('libraries:importZip'),
    s3Creds:     (id: string)                                     => api.invoke('libraries:s3Creds', id),
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

  agent: {
    getConfig: () => api.invoke('agent:getConfig'),
    setProfile: (name: string) => api.invoke('agent:setProfile', name),
    updateProfile: (name: string, patch: import('@shared/types').ProfilePatch) =>
                                                          api.invoke('agent:updateProfile', name, patch),
    saveKey: (profile: string, key: string, remember: boolean) => api.invoke('agent:saveKey', profile, key, remember),
    loadKey: (profile: string) => api.invoke('agent:loadKey', profile),
    testKey: (profile: string) => api.invoke('agent:testKey', profile),
    getProfiles: () => api.invoke('agent:getProfiles'),
  },

  fs: {
    read:   (rootId: string, rel: string) => api.invoke('fs:read', rootId, rel),
    write:  (rootId: string, rel: string, data: Uint8Array | string) => api.invoke('fs:write', rootId, rel, data),
    delete: (rootId: string, rel: string) => api.invoke('fs:delete', rootId, rel),
    list:   (rootId: string, prefix: string) => api.invoke('fs:list', rootId, prefix),
    exists: (rootId: string, rel: string) => api.invoke('fs:exists', rootId, rel),
  },

  paths: {
    libraryRoot: (id: string) => api.invoke('paths:libraryRoot', id),
    userData:    ()           => api.invoke('paths:userData'),
  },

  dialog: {
    openPdf: () => api.invoke('dialog:openPdf'),
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
