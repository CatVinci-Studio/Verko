import type {
  AgentConfig, AgentProfile, ChatContentPart, LibraryInfo, LibraryNonePayload,
  NewLibraryInput, NewS3LibraryInput, ProbeResult, ProfilePatch,
} from '@shared/types'

type UnsubFn = () => void

/**
 * Contract for the preload-bridged `window.api` on desktop. Narrower than
 * the renderer-facing `IApi` — `papers/schema/collections/pdf/conversations`
 * are filled in by `desktopApi.ts` using the Library + Agent that live in
 * the renderer.
 */
export interface IPreloadApi {
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
