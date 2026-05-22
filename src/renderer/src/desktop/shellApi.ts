import type {
  AgentConfig, AgentProfile, ChatContentPart, LibraryInfo, LibraryNonePayload,
  NewLibraryInput, NewS3LibraryInput, ProbeResult, ProfilePatch,
} from '@shared/types'
import type { SimpleRequest, SimpleResponse } from '@shared/net/fetch'

type UnsubFn = () => void

/**
 * Narrow IO contract that the Tauri shell implements (see
 * `src/renderer/src/tauri/tauriShell.ts`). `desktopApi.ts` wraps this
 * up into the full `IApi` by attaching the renderer-side Library + Agent
 * (papers / schema / collections / pdf / conversations).
 */
export interface IShellApi {
  libraries: {
    list(): Promise<LibraryInfo[]>
    open(id: string): Promise<LibraryInfo>
    add(input: NewLibraryInput): Promise<LibraryInfo>
    remove(id: string): Promise<void>
    rename(id: string, newName: string): Promise<void>
    pickFolder(): Promise<string | null>
    probeLocal(path: string): Promise<ProbeResult>
    probeS3(cfg: Omit<NewS3LibraryInput, 'kind' | 'name' | 'initialize'>): Promise<ProbeResult>
    hasNone(): Promise<boolean>
    exportZip(id: string): Promise<string | null>
    importZip(): Promise<LibraryInfo | null>
    s3Creds(id: string): Promise<{ accessKeyId: string; secretAccessKey: string } | null>
    onSwitched(cb: (info: LibraryInfo) => void): UnsubFn
    onNone(cb: (payload: LibraryNonePayload) => void): UnsubFn
  }
  agent: {
    getConfig(): Promise<AgentConfig | null>
    setProfile(name: string): Promise<void>
    updateProfile(name: string, patch: ProfilePatch): Promise<void>
    saveKey(profile: string, key: string, remember: boolean): Promise<void>
    loadKey(profile: string): Promise<string | null>
    testKey(profile: string): Promise<boolean>
    getProfiles(): Promise<AgentProfile[]>
  }
  fs: {
    read(rootId: string, rel: string): Promise<Uint8Array>
    write(rootId: string, rel: string, data: Uint8Array | string): Promise<void>
    delete(rootId: string, rel: string): Promise<void>
    list(rootId: string, prefix: string): Promise<string[]>
    exists(rootId: string, rel: string): Promise<boolean>
  }
  paths: {
    libraryRoot(id: string): Promise<string | null>
    userData(): Promise<string>
  }
  dialog: {
    openPdf(): Promise<{ filename: string; bytes: Uint8Array } | null>
  }
  net: {
    /** Native HTTP fetch routed through Rust — bypasses webview CORS. */
    fetch(req: SimpleRequest): Promise<SimpleResponse>
    /** Open URL in the user's default browser. */
    openExternal(url: string): Promise<void>
  }
  oauth: {
    /**
     * Bind a one-shot loopback HTTP listener and resolve with the OAuth
     * `code` + `state` returned by the redirect. Desktop-only — web
     * builds reject because a webview can't bind a TCP socket.
     */
    loopbackWait(port: number, path: string, timeoutSecs: number): Promise<{ code: string; state: string }>
  }
  deepLink: {
    /**
     * Subscribe to URLs handed to Verko via the OS share sheet (iOS) /
     * Send intent (Android). The Rust deep-link bridge emits each match
     * on the webview event bus; this method wires a callback to those
     * events and returns an unsubscribe.
     */
    onIngest(cb: (url: string) => void): UnsubFn
  }
  app: {
    platform: NodeJS.Platform
    onMenuCommand(cb: (cmd: string) => void): UnsubFn
  }
  window: {
    minimize(): void
    toggleMaximize(): void
    close(): void
    onMaximized(cb: (maximized: boolean) => void): UnsubFn
  }
  // Used by `DesktopAgent` / IPC helpers and accepted optionally for backward compat with stub usages
  send?: (message: string, attachments?: ChatContentPart[]) => Promise<void>
}
