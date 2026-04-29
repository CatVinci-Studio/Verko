import type { IApi } from '@/lib/ipc'
import type { LibraryInfo, S3LibraryInfo } from '@shared/types'
import { WebS3, type S3Creds } from './s3client'
import { WebLibrary } from './webLibrary'
import { clearCreds, loadCreds, saveCreds } from './credentials'

/**
 * Web build adapter for IApi. Read-only — every write op resolves with a
 * "not supported" error so the UI surfaces the limitation. The single active
 * library is whatever S3 connection is stored in IndexedDB; there is no
 * concept of multi-library on the web.
 */

let lib: WebLibrary | null = null
let info: LibraryInfo | null = null

const switchedListeners = new Set<(info: LibraryInfo) => void>()

function notSupported(): Promise<never> {
  return Promise.reject(new Error('This action is only available in the desktop app.'))
}

function buildInfo(creds: S3Creds, paperCount: number): S3LibraryInfo {
  return {
    id: 'web-s3',
    name: creds.bucket,
    kind: 's3',
    endpoint: creds.endpoint,
    region: creds.region,
    bucket: creds.bucket,
    prefix: creds.prefix,
    active: true,
    paperCount,
  }
}

async function ensureLib(): Promise<WebLibrary | null> {
  if (lib) return lib
  const creds = await loadCreds()
  if (!creds) return null
  const s3 = new WebS3(creds)
  const l = new WebLibrary(s3)
  await l.load()
  lib = l
  info = buildInfo(creds, (await l.list()).length)
  return l
}

async function reload(creds: S3Creds): Promise<LibraryInfo> {
  const s3 = new WebS3(creds)
  await s3.ping()
  const l = new WebLibrary(s3)
  await l.load()
  await saveCreds(creds)
  lib = l
  info = buildInfo(creds, (await l.list()).length)
  for (const cb of switchedListeners) cb(info)
  return info
}

export const webApi: IApi = {
  libraries: {
    list: async () => {
      await ensureLib()
      return info ? [info] : []
    },
    open: async () => {
      const cur = info ?? (await ensureLib(), info)
      if (!cur) throw new Error('No active library')
      return cur
    },
    add: async (input) => {
      if (input.kind !== 's3') throw new Error('Web build only supports S3 libraries.')
      return reload({
        endpoint: input.endpoint,
        region: input.region,
        bucket: input.bucket,
        prefix: input.prefix,
        accessKeyId: input.accessKeyId,
        secretAccessKey: input.secretAccessKey,
        forcePathStyle: input.forcePathStyle,
      })
    },
    remove: async () => {
      await clearCreds()
      lib = null
      info = null
    },
    rename: notSupported,
    pickFolder: () => Promise.resolve(null),
    probeLocal: () => Promise.resolve({ status: 'error', message: 'Local libraries are desktop-only.' }),
    probeS3: async (cfg) => {
      try {
        const s3 = new WebS3(cfg)
        await s3.ping()
        const hasSchema = await s3.exists('schema.md')
        return { status: hasSchema ? 'ready' : 'uninitialized' }
      } catch (e) {
        return { status: 'error', message: e instanceof Error ? e.message : String(e) }
      }
    },
    hasNone: async () => {
      await ensureLib()
      return info == null
    },
    exportZip: () => Promise.resolve(null),
    importZip: () => Promise.resolve(null),
    onSwitched: (cb) => {
      switchedListeners.add(cb)
      return () => switchedListeners.delete(cb)
    },
    onNone: () => () => {},
  },

  collections: {
    list: async () => {
      const l = await ensureLib()
      return l?.listCollections() ?? []
    },
    create: notSupported, delete: notSupported, rename: notSupported,
    addPaper: notSupported, removePaper: notSupported,
  },

  papers: {
    list: async (filter, collection) => {
      const l = await ensureLib()
      return l ? l.list(filter, collection) : []
    },
    get: async (id) => {
      const l = await ensureLib()
      if (!l) throw new Error('No active library')
      return l.get(id)
    },
    add: notSupported, update: notSupported, delete: notSupported,
    search: async (q) => {
      const l = await ensureLib()
      return l ? l.search(q) : []
    },
    importDoi: notSupported, importPdf: notSupported,
  },

  schema: {
    get: async () => {
      const l = await ensureLib()
      return l?.schema() ?? { version: 1, columns: [] }
    },
    addColumn: notSupported, removeColumn: notSupported, renameColumn: notSupported,
  },

  agent: {
    send: () => Promise.reject(new Error('The agent is only available in the desktop app.')),
    abort: () => Promise.resolve(),
    getConfig: () => Promise.resolve(null),
    setProfile: notSupported, updateProfile: notSupported,
    saveKey: () => Promise.reject(new Error('Web build does not support agent yet')), testKey: () => Promise.resolve(false),
    getProfiles: () => Promise.resolve([]),
    onEvent: () => () => {},
  },

  conversations: {
    list:   () => Promise.resolve([]),
    get:    () => Promise.reject(new Error('No conversations in web build')),
    create: () => Promise.reject(new Error('No conversations in web build')),
    rename: notSupported, delete: notSupported,
  },

  pdf: {
    getPath: async (id) => {
      const l = await ensureLib()
      if (!l) return null
      const bytes = await l.pdfBytes(id)
      if (!bytes) return null
      const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' })
      return URL.createObjectURL(blob)
    },
  },
}
