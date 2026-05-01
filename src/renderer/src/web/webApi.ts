import type { IApi } from '@/lib/ipc'
import type { LibraryInfo, S3LibraryInfo, AgentConfig, AgentProfile } from '@shared/types'
import { PROVIDER_DEFINITIONS } from '@shared/providers'
import { createProvider } from '@shared/agent/providers'
import { browserFetcher } from '@shared/net/fetch'
import { buildProviderForProfile } from '@/lib/providerBuild'
import { Library } from '@shared/paperdb/store'
import { S3Backend, type S3BackendConfig } from '@shared/paperdb/backendS3'
import { LocalStorageBackend } from '@shared/paperdb/backendLocalStorage'
import { ConversationStore } from '@shared/agent/conversationStore'
import { SHARED_TOOLS, dispatchFromRegistry } from '@shared/agent/tools'
import { buildLibraryFacade } from '@/lib/libraryFacade'
import { buildAgentFacade } from '@/lib/agentFacade'
import { clearCreds, loadCreds, saveCreds } from './credentials'
import { hasApiKey, loadApiKey, saveApiKey } from './apiKeys'

type S3Creds = S3BackendConfig

/**
 * Web build adapter for `IApi`. Single S3-backed library, single agent
 * runtime over `LocalStorageBackend`. Mirrors `makeDesktopApi` — only the
 * storage backend choice differs.
 *
 * Mutations against the active library do work; only multi-library /
 * platform-specific operations (`pickFolder`, `exportZip`, …) reject.
 */

let lib: Library | null = null
let s3Creds: S3Creds | null = null
let info: LibraryInfo | null = null

const switchedListeners = new Set<(info: LibraryInfo) => void>()

const ACTIVE_PROFILE_LS = 'verko:active-profile'

function getActiveProfileId(): string {
  return localStorage.getItem(ACTIVE_PROFILE_LS) || PROVIDER_DEFINITIONS[0].id
}

function setActiveProfileId(id: string): void {
  localStorage.setItem(ACTIVE_PROFILE_LS, id)
}

const convStore = new ConversationStore(new LocalStorageBackend('verko:conv'))
const transcriptBackend = new LocalStorageBackend('verko:transcripts')
const toolDefs = Object.values(SHARED_TOOLS).map((h) => h.def)

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

async function ensureLib(): Promise<Library | null> {
  if (lib) return lib
  const creds = await loadCreds() as S3Creds | null
  if (!creds) return null
  const backend = new S3Backend(creds)
  const l = await Library.open(backend)
  lib = l
  s3Creds = creds
  info = buildInfo(creds, (await l.list()).length)
  return l
}

async function reload(creds: S3Creds): Promise<LibraryInfo> {
  const backend = new S3Backend(creds)
  await backend.probe()
  const l = await Library.open(backend)
  await saveCreds(creds)
  lib = l
  s3Creds = creds
  info = buildInfo(creds, (await l.list()).length)
  for (const cb of switchedListeners) cb(info)
  return info
}

const libFacade = buildLibraryFacade(() => ensureLib())

const ag = buildAgentFacade({
  store: convStore,
  config: {
    getConfig: async (): Promise<AgentConfig> => ({
      defaultProfile: getActiveProfileId(),
      profiles: PROVIDER_DEFINITIONS.map((d) => ({
        name: d.id,
        protocol: d.protocol,
        baseUrl: d.defaults.baseUrl,
        model: d.defaults.model,
      })),
      maxTurns: 10,
      temperature: 0.3,
      showToolCalls: true,
    }),
    setProfile: async (id) => { setActiveProfileId(id) },
    updateProfile: async () => {
      // Models / baseUrls are catalog-driven in the web build.
    },
    saveKey: async (profile, key, remember) => { saveApiKey(profile, key, remember) },
    loadKey: async (profile) => loadApiKey(profile),
    testKey: async (profile) => {
      const def = PROVIDER_DEFINITIONS.find((d) => d.id === profile)
      if (!def) return false
      const apiKey = loadApiKey(profile)
      if (!apiKey) return false
      try {
        const provider = createProvider({
          protocol: def.protocol,
          baseUrl: def.defaults.baseUrl,
          apiKey,
          model: def.defaults.model,
        })
        return await provider.testConnection()
      } catch {
        return false
      }
    },
    getProfiles: async (): Promise<AgentProfile[]> =>
      PROVIDER_DEFINITIONS.map((d) => ({
        name: d.id,
        protocol: d.protocol,
        baseUrl: d.defaults.baseUrl,
        model: d.defaults.model,
        hasKey: hasApiKey(d.id),
      })),
  },
  ports: {
    async getProvider() {
      const def = PROVIDER_DEFINITIONS.find((d) => d.id === getActiveProfileId())
      if (!def) return null
      return buildProviderForProfile(
        {
          name: def.id,
          protocol: def.protocol,
          baseUrl: def.defaults.baseUrl,
          model: def.defaults.model,
        },
        {
          load: (name) => loadApiKey(name),
          save: (name, value) => { saveApiKey(name, value, true) },
        },
      )
    },
    describeContext: async () => {
      const l = await ensureLib()
      const base = {
        libraryName: s3Creds?.bucket ?? 'Library',
        libraryRoot: l?.backend.describe() ?? '(no library)',
      }
      if (!l) return { ...base, paperCount: 0, collections: [], customColumns: [], skills: [] }
      const refs = await l.list()
      return {
        ...base,
        paperCount: refs.length,
        collections: l.listCollections(),
        customColumns: l.schema().columns.map((c) => ({ name: c.name, type: c.type })),
        skills: await l.listSkills(),
      }
    },
    getTools: () => toolDefs,
    dispatchTool: async (name, args) => {
      if (!lib) return JSON.stringify({ error: 'No active library.' })
      return dispatchFromRegistry(SHARED_TOOLS, name, args, { library: lib })
    },
    store: convStore,
    saveTranscript: async (convId, snapshot) => {
      const key = `${convId}-${Date.now()}.json`
      try {
        await transcriptBackend.writeFile(key, JSON.stringify(snapshot))
        return key
      } catch {
        return null
      }
    },
    maxTurns: 10,
    temperature: 0.3,
  },
})

// Web build only supports a subset of paper / collection mutations; override
// with `notSupported` after the facade so the type is preserved.
const papers: IApi['papers'] = {
  ...libFacade.papers,
  add: notSupported,
  update: notSupported,
  delete: notSupported,
  importPdf: notSupported,
}

const collections: IApi['collections'] = {
  ...libFacade.collections,
  create: notSupported,
  delete: notSupported,
  rename: notSupported,
  addPaper: notSupported,
  removePaper: notSupported,
}

const schema: IApi['schema'] = {
  ...libFacade.schema,
  addColumn: notSupported,
  removeColumn: notSupported,
  renameColumn: notSupported,
}

const pdf: IApi['pdf'] = {
  getPath: async (id) => {
    const l = await ensureLib()
    if (!l) return null
    const stream = l.pdfStream(id)
    if (!stream) return null
    const reader = stream.getReader()
    const chunks: Uint8Array[] = []
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) chunks.push(value)
    }
    const total = chunks.reduce((n, c) => n + c.length, 0)
    const bytes = new Uint8Array(total)
    let off = 0
    for (const c of chunks) { bytes.set(c, off); off += c.length }
    const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' })
    return URL.createObjectURL(blob)
  },
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
        const backend = new S3Backend(cfg as S3Creds)
        await backend.probe()
        const hasSchema = await backend.exists('schema.md')
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
  papers,
  schema,
  collections,
  agent: ag.agent,
  conversations: ag.conversations,
  pdf,
  fs: {
    read:   () => Promise.reject(new Error('fs is desktop-only')),
    write:  () => Promise.reject(new Error('fs is desktop-only')),
    delete: () => Promise.reject(new Error('fs is desktop-only')),
    list:   () => Promise.resolve([]),
    exists: () => Promise.resolve(false),
  },
  paths: {
    libraryRoot: () => Promise.resolve(null),
  },
  app: {
    platform: 'web' as unknown as NodeJS.Platform,
    onMenuCommand: () => () => {},
  },
  window: {
    minimize: () => {},
    toggleMaximize: () => {},
    close: () => {},
    onMaximized: () => () => {},
  },
  net: {
    fetch: browserFetcher,
    openExternal: async (url) => { window.open(url, '_blank', 'noopener,noreferrer') },
  },
  oauth: {
    // The Codex flow's OAuth client ID is registered for `localhost:1455`,
    // which a browser tab can't bind. A web build would need a separate
    // OAuth client + hosted redirect page — out of scope for this build.
    loopbackWait: () => Promise.reject(new Error('ChatGPT sign-in is only available in the desktop app.')),
  },
}
