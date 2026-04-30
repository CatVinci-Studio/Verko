import type {
  PaperRef, PaperDetail, PaperDraft, PaperPatch, PaperId,
  Filter, SearchHit, Schema, Column, AgentEventEnvelope, AgentConfig,
  AgentProfile, ProfilePatch, Language, LibraryInfo, CollectionInfo,
  NewLibraryInput, NewS3LibraryInput, ProbeResult, LibraryNonePayload,
  ChatContentPart, ChatMessage, ConversationSummary, Conversation,
} from '@shared/types'

type UnsubFn = () => void

export interface IApi {
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
    onSwitched(cb: (info: LibraryInfo) => void): UnsubFn
    onNone(cb: (payload: LibraryNonePayload) => void): UnsubFn
  }
  collections: {
    list(): Promise<CollectionInfo[]>
    create(name: string): Promise<void>
    delete(name: string): Promise<void>
    rename(oldName: string, newName: string): Promise<void>
    addPaper(id: PaperId, name: string): Promise<void>
    removePaper(id: PaperId, name: string): Promise<void>
  }
  papers: {
    list(filter?: Filter, collection?: string): Promise<PaperRef[]>
    get(id: PaperId): Promise<PaperDetail>
    add(draft: PaperDraft): Promise<PaperId>
    update(id: PaperId, patch: PaperPatch): Promise<void>
    delete(id: PaperId): Promise<void>
    search(q: string, filter?: Filter): Promise<SearchHit[]>
    importArxiv(input: string): Promise<PaperId>
    /** Show a native picker, copy the chosen PDF into the active library, return the new id. */
    importPdf(): Promise<PaperId>
  }
  schema: {
    get(): Promise<Schema>
    addColumn(col: Column): Promise<void>
    removeColumn(name: string): Promise<void>
    renameColumn(from: string, to: string): Promise<void>
  }
  agent: {
    send(
      message: string,
      attachments?: ChatContentPart[],
      paperId?: string,
      language?: Language,
      conversationId?: string,
    ): Promise<string>
    abort(conversationId?: string): Promise<void>
    compact(conversationId: string): Promise<void>
    getConfig(): Promise<AgentConfig | null>
    setProfile(name: string): Promise<void>
    updateProfile(name: string, patch: ProfilePatch): Promise<void>
    saveKey(profile: string, key: string, remember: boolean): Promise<void>
    loadKey(profile: string): Promise<string | null>
    testKey(profile: string): Promise<boolean>
    getProfiles(): Promise<AgentProfile[]>
    onEvent(cb: (envelope: AgentEventEnvelope) => void): UnsubFn
  }
  conversations: {
    list(): Promise<ConversationSummary[]>
    get(id: string): Promise<Conversation>
    create(title?: string): Promise<ConversationSummary>
    rename(id: string, title: string): Promise<void>
    delete(id: string): Promise<void>
    append(id: string, msg: ChatMessage): Promise<Conversation>
  }
  pdf: {
    getPath(id: PaperId): Promise<string | null>
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
}

declare global {
  interface Window {
    api: IApi
  }
}

import { webApi } from '@/web/webApi'
import { makeDesktopApi } from '@/desktop/desktopApi'
import type { IPreloadApi } from '@/desktop/preloadApi'

declare const __WEB_BUILD__: boolean | undefined

/**
 * Pick the right `IApi` for the runtime:
 *   - Electron renderer: `window.api` is set by preload → wrap with `makeDesktopApi`
 *   - Web build: `__WEB_BUILD__` define is true → use S3-backed `webApi`
 * Anything else throws — there is no third runtime.
 */
function pickApi(): IApi {
  const electronApi = (window as unknown as { api?: IPreloadApi }).api
  if (electronApi) return makeDesktopApi(electronApi)
  if (typeof __WEB_BUILD__ !== 'undefined' && __WEB_BUILD__) return webApi
  throw new Error('Verko: no IApi backend (neither window.api nor __WEB_BUILD__ available).')
}

export const api: IApi = pickApi()
