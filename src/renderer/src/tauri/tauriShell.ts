import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { openUrl } from '@tauri-apps/plugin-opener'
import type { HttpFetchRequest, HttpFetchResponse, IShellApi } from '@/desktop/shellApi'
import type {
  AgentConfig, AgentProfile, LibraryInfo, LibraryNonePayload,
  NewS3LibraryInput, ProbeResult, ProfilePatch,
} from '@shared/types'
import { PROVIDER_DEFINITIONS } from '@shared/providers'
import { createProvider } from '@shared/agent/providers'
import { S3Backend } from '@shared/paperdb/backendS3'
import { BackendAuthError, BackendNetworkError } from '@shared/paperdb/backend'

/**
 * Tauri-side `IShellApi` — the IO contract that `makeDesktopApi` wraps
 * into the consumer-facing `IApi`.
 *
 * Split of responsibilities:
 *   - File IO / dialogs / library registry / OS keychain → Rust commands
 *   - Agent config + profile editing → localStorage (mirrors `webApi`,
 *     keeps the catalog as the single source of truth)
 *   - `probeS3` / `testKey` → renderer (S3 + provider SDKs already run here)
 */

const ACTIVE_PROFILE_LS = 'verko:active-profile'
const PROFILE_OVERRIDES_LS = 'verko:profile-overrides'

function readOverrides(): Record<string, Partial<AgentProfile>> {
  try {
    const raw = localStorage.getItem(PROFILE_OVERRIDES_LS)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}
function writeOverrides(map: Record<string, Partial<AgentProfile>>): void {
  localStorage.setItem(PROFILE_OVERRIDES_LS, JSON.stringify(map))
}
function getActiveProfile(): string {
  return localStorage.getItem(ACTIVE_PROFILE_LS) || PROVIDER_DEFINITIONS[0].id
}
function setActiveProfile(id: string): void {
  localStorage.setItem(ACTIVE_PROFILE_LS, id)
}

type ProfileBase = Omit<AgentProfile, 'hasKey'>

function buildProfile(id: string): ProfileBase {
  const def = PROVIDER_DEFINITIONS.find((d) => d.id === id)!
  const overrides = readOverrides()[id] ?? {}
  return {
    name: def.id,
    protocol: def.protocol,
    baseUrl: overrides.baseUrl ?? def.defaults.baseUrl,
    model: overrides.model ?? def.defaults.model,
  }
}

export const tauriShell: IShellApi = {
  libraries: {
    list:        ()           => invoke<LibraryInfo[]>('libraries_list'),
    open:        (id)         => invoke<LibraryInfo>('libraries_open', { id }),
    add:         (input)      => invoke<LibraryInfo>('libraries_add', { input }),
    remove:      (id)         => invoke<void>('libraries_remove', { id }),
    rename:      (id, name)   => invoke<void>('libraries_rename', { id, newName: name }),
    pickFolder:  ()           => invoke<string | null>('libraries_pick_folder'),
    probeLocal:  (path)       => invoke<ProbeResult>('libraries_probe_local', { path }),
    probeS3:     async (cfg: Omit<NewS3LibraryInput, 'kind' | 'name' | 'initialize'>) => {
      try {
        const be = new S3Backend(cfg)
        await be.probe()
        const hasSchema = await be.exists('schema.md')
        return { status: hasSchema ? 'ready' : 'uninitialized' }
      } catch (e) {
        if (e instanceof BackendAuthError) {
          return { status: 'error', message: 'Auth failed — check access key and secret' }
        }
        if (e instanceof BackendNetworkError) {
          return { status: 'error', message: 'Network error — check endpoint and connection' }
        }
        return { status: 'error', message: e instanceof Error ? e.message : String(e) }
      }
    },
    hasNone:     ()           => invoke<boolean>('libraries_has_none'),
    exportZip:   (id)         => invoke<string | null>('libraries_export_zip', { id }),
    importZip:   ()           => invoke<LibraryInfo | null>('libraries_import_zip'),
    s3Creds:     (id)         => invoke<{ accessKeyId: string; secretAccessKey: string } | null>('libraries_s3_creds', { id }),
    onSwitched:  (cb) => {
      const p = listen<LibraryInfo>('library:switched', (e) => cb(e.payload))
      return () => { void p.then((u) => u()) }
    },
    onNone: (cb) => {
      const p = listen<LibraryNonePayload>('library:none', (e) => cb(e.payload))
      return () => { void p.then((u) => u()) }
    },
  },

  agent: {
    getConfig: async (): Promise<AgentConfig> => ({
      defaultProfile: getActiveProfile(),
      profiles: PROVIDER_DEFINITIONS.map((d) => buildProfile(d.id)),
      maxTurns: 10,
      temperature: 0.3,
      showToolCalls: true,
    }),
    setProfile: async (name) => { setActiveProfile(name) },
    updateProfile: async (name, patch: ProfilePatch) => {
      const map = readOverrides()
      map[name] = { ...(map[name] ?? {}), ...patch }
      writeOverrides(map)
    },
    saveKey: (profile, key, remember) => invoke<void>('agent_save_key', { profile, key, remember }),
    loadKey: (profile)                 => invoke<string | null>('agent_load_key', { profile }),
    testKey: async (profile) => {
      const def = PROVIDER_DEFINITIONS.find((d) => d.id === profile)
      if (!def) return false
      const apiKey = await invoke<string | null>('agent_load_key', { profile })
      if (!apiKey) return false
      try {
        const p = buildProfile(def.id)
        return await createProvider({
          protocol: p.protocol, baseUrl: p.baseUrl, apiKey, model: p.model,
        }).testConnection()
      } catch {
        return false
      }
    },
    getProfiles: async (): Promise<AgentProfile[]> => {
      const profiles = PROVIDER_DEFINITIONS.map((d) => buildProfile(d.id))
      const flags = await Promise.all(
        profiles.map((p) =>
          invoke<boolean>('agent_has_key', { profile: p.name }).catch(() => false),
        ),
      )
      return profiles.map((p, i) => ({ ...p, hasKey: flags[i] }))
    },
  },

  fs: {
    read:   async (rootId, rel) => new Uint8Array(await invoke<ArrayBuffer>('fs_read', { rootId, rel })),
    write:  (rootId, rel, data) => invoke<void>('fs_write', {
      rootId,
      rel,
      data: typeof data === 'string' ? Array.from(new TextEncoder().encode(data)) : Array.from(data),
    }),
    delete: (rootId, rel)       => invoke<void>('fs_delete', { rootId, rel }),
    list:   (rootId, prefix)    => invoke<string[]>('fs_list', { rootId, prefix }),
    exists: (rootId, rel)       => invoke<boolean>('fs_exists', { rootId, rel }),
  },

  paths: {
    libraryRoot: (id) => invoke<string | null>('paths_library_root', { rootId: id }),
    userData:    ()   => invoke<string>('paths_user_data'),
  },

  dialog: {
    openPdf: () => invoke<{ filename: string; bytes: number[] } | null>('dialog_open_pdf')
      .then((r) => r ? { filename: r.filename, bytes: new Uint8Array(r.bytes) } : null),
  },

  net: {
    fetch: (req: HttpFetchRequest) => invoke<HttpFetchResponse>('http_fetch', { req }),
    openExternal: (url: string) => openUrl(url),
  },

  app: {
    // Tauri runs on whatever desktop platform; the renderer only branches on
    // 'darwin' for cosmetic touches (traffic-light spacing). Use the JS-side
    // navigator.platform — good enough until we wire `os` plugin.
    platform: (navigator.platform.toLowerCase().includes('mac') ? 'darwin'
            : navigator.platform.toLowerCase().includes('win') ? 'win32'
            : 'linux') as NodeJS.Platform,
    onMenuCommand: (_cb) => () => {},
  },

  window: {
    minimize:       () => { void getCurrentWindow().minimize() },
    toggleMaximize: () => { void getCurrentWindow().toggleMaximize() },
    close:          () => { void getCurrentWindow().close() },
    onMaximized: (cb) => {
      const w = getCurrentWindow()
      const p = w.onResized(async () => { cb(await w.isMaximized()) })
      return () => { void p.then((u) => u()) }
    },
  },
}
