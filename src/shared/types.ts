// ─── Column / Schema ─────────────────────────────────────────────────────────

export type ColumnType =
  | 'text'
  | 'number'
  | 'date'
  | 'bool'
  | 'select'
  | 'multiselect'
  | 'tags'
  | 'url'
  | 'link' // reference to another PaperId

export interface ColumnOption {
  value: string
  color?: string
}

export interface Column {
  name: string
  type: ColumnType
  options?: ColumnOption[]   // for select / multiselect
  default?: unknown
  inCsv: boolean             // whether to project into papers.csv
  hidden?: boolean           // hidden in list view
}

export interface Schema {
  version: number
  columns: Column[]
}

// ─── Paper ───────────────────────────────────────────────────────────────────

export type PaperId = string  // e.g. "2024-ho-ddpm" or 7-char hash

export type PaperStatus = 'unread' | 'reading' | 'read' | 'archived'

export interface Paper {
  id: PaperId
  title: string
  authors: string[]
  year?: number
  venue?: string
  doi?: string
  url?: string
  tags: string[]
  status: PaperStatus
  rating?: number           // 0–5
  added_at: string          // ISO 8601
  updated_at: string
  // custom columns (schema-defined) land here as key→value
  [key: string]: unknown
}

/** Lightweight row for the list view — no markdown content */
export interface PaperRef {
  id: PaperId
  title: string
  authors: string[]
  year?: number
  venue?: string
  doi?: string
  url?: string
  tags: string[]
  status: PaperStatus
  rating?: number
  added_at: string
  updated_at: string
  hasPdf: boolean
  [key: string]: unknown
}

/** Full paper with markdown body */
export interface PaperDetail extends PaperRef {
  markdown: string          // full .md content below frontmatter
}

export interface PaperDraft {
  title: string
  authors?: string[]
  year?: number
  venue?: string
  doi?: string
  url?: string
  tags?: string[]
  status?: PaperStatus
  markdown?: string
  [key: string]: unknown
}

export type PaperPatch = Partial<Omit<Paper, 'id' | 'added_at'>> & {
  markdown?: string
}

// ─── Search ──────────────────────────────────────────────────────────────────

export interface Filter {
  status?: PaperStatus[]
  tags?: string[]
  yearFrom?: number
  yearTo?: number
  query?: string
}

export interface SearchHit {
  paper: PaperRef
  score: number
  terms: string[]
}

// ─── Agent ───────────────────────────────────────────────────────────────────

export interface AgentTextEvent       { type: 'text';        delta: string }
export interface AgentToolStart       { type: 'tool_start';  name: string; args: unknown }
export interface AgentToolResult      { type: 'tool_result'; name: string; result: unknown }
export interface AgentErrorEvent      { type: 'error';       message: string }
export interface AgentDoneEvent       { type: 'done' }
export interface AgentCompactedEvent  { type: 'compacted' }

export type AgentEvent =
  | AgentTextEvent
  | AgentToolStart
  | AgentToolResult
  | AgentErrorEvent
  | AgentDoneEvent
  | AgentCompactedEvent

/** API protocol the profile speaks. `custom` profiles let the user pick. */
export type AgentProtocol = 'openai' | 'anthropic' | 'gemini'

export interface AgentProfile {
  name: string
  protocol: AgentProtocol
  baseUrl: string
  model: string
  hasKey: boolean
}

/** Editable fields of a provider profile. `name` and `hasKey` are not patchable. */
export type ProfilePatch = Partial<Pick<AgentProfile, 'baseUrl' | 'model' | 'protocol'>>

/** Supported UI languages — also used to pick the system prompt template. */
export type Language = 'en' | 'zh'

export interface AgentConfig {
  defaultProfile: string
  profiles: Omit<AgentProfile, 'hasKey'>[]
  maxTurns: number
  temperature: number
  showToolCalls: boolean
}

export interface AgentEventEnvelope {
  conversationId: string
  event: AgentEvent
}

// ─── Conversations ───────────────────────────────────────────────────────────

export type ChatRole = 'user' | 'assistant' | 'tool'

export interface ChatContentText {
  type: 'text'
  text: string
}
export interface ChatContentImage {
  type: 'image'
  data: string       // base64 (no data: prefix)
  mimeType: string
}
export type ChatContentPart = ChatContentText | ChatContentImage

export interface ChatToolCall {
  id: string
  name: string
  arguments: string
}

export interface ChatMessage {
  role: ChatRole
  content: ChatContentPart[]
  toolCalls?: ChatToolCall[]
  toolCallId?: string
  toolName?: string
  /** Local timestamp; not sent to the model. */
  createdAt?: number
}

export interface ConversationSummary {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messageCount: number
}

export interface Conversation extends ConversationSummary {
  messages: ChatMessage[]
}

// ─── Collections ─────────────────────────────────────────────────────────────

export interface CollectionInfo {
  name: string
  paperCount: number
}

// ─── Library management ──────────────────────────────────────────────────────

export type LibraryKind = 'local' | 's3'

export interface LibraryInfoBase {
  id: string
  name: string
  kind: LibraryKind
  active: boolean
  paperCount: number
  lastOpenedAt?: number
}

export interface LocalLibraryInfo extends LibraryInfoBase {
  kind: 'local'
  path: string
}

export interface S3LibraryInfo extends LibraryInfoBase {
  kind: 's3'
  endpoint?: string
  region: string
  bucket: string
  prefix?: string
}

export type LibraryInfo = LocalLibraryInfo | S3LibraryInfo

/** Form-shape input for adding a new library. Credentials never live in the registry. */
export interface NewLocalLibraryInput {
  kind: 'local'
  name: string
  path: string
  initialize?: boolean
}

export interface NewS3LibraryInput {
  kind: 's3'
  name: string
  endpoint?: string
  region: string
  bucket: string
  prefix?: string
  forcePathStyle?: boolean
  accessKeyId: string
  secretAccessKey: string
  initialize?: boolean
}

export type NewLibraryInput = NewLocalLibraryInput | NewS3LibraryInput

export type ProbeStatus = 'ready' | 'uninitialized' | 'error'

export interface ProbeResult {
  status: ProbeStatus
  message?: string
}

/** State shipped to the renderer when no library is currently open. */
export interface LibraryNonePayload {
  reason: 'empty' | 'last-failed'
  message?: string
}

// ─── IPC channel map (main ↔ renderer) ───────────────────────────────────────

export interface IpcChannels {
  // Libraries (multi-library management — new entry-based API)
  'libraries:list':     { args: [];                              ret: LibraryInfo[] }
  'libraries:open':     { args: [string];                        ret: LibraryInfo } // id
  'libraries:add':      { args: [NewLibraryInput];               ret: LibraryInfo }
  'libraries:remove':   { args: [string];                        ret: void }        // id (unregisters, no delete)
  'libraries:rename':   { args: [string, string];                ret: void }        // id, newName
  'libraries:pickFolder': { args: [];                            ret: string | null }
  'libraries:probeLocal': { args: [string];                      ret: ProbeResult } // path
  'libraries:probeS3':    { args: [Omit<NewS3LibraryInput, 'kind' | 'name' | 'initialize'>]; ret: ProbeResult }
  'libraries:hasNone':    { args: [];                            ret: boolean }
  'libraries:exportZip':  { args: [string];                      ret: string | null } // libraryId → savedPath (null = cancelled)
  'libraries:importZip':  { args: [];                            ret: LibraryInfo | null } // null = cancelled
  'libraries:s3Creds':    { args: [string]; ret: { accessKeyId: string; secretAccessKey: string } | null }

  // Agent — config + key store only. The loop runs in the renderer.
  'agent:getConfig':     { args: [];                        ret: AgentConfig }
  'agent:setProfile':    { args: [string];                  ret: void }
  'agent:updateProfile': { args: [string, ProfilePatch];    ret: void }
  'agent:saveKey':       { args: [string, string, boolean]; ret: void } // profile, key, remember
  'agent:loadKey':       { args: [string];                  ret: string | null }
  'agent:testKey':       { args: [string];                  ret: boolean }
  'agent:getProfiles':   { args: [];                        ret: AgentProfile[] }

  // Filesystem (zero-trust scoped). All paths are (rootId, relPath).
  'fs:read':   { args: [string, string];                            ret: Uint8Array }
  'fs:write':  { args: [string, string, Uint8Array | string];       ret: void }
  'fs:delete': { args: [string, string];                            ret: void }
  'fs:list':   { args: [string, string];                            ret: string[] }
  'fs:exists': { args: [string, string];                            ret: boolean }

  // Path resolution
  'paths:libraryRoot': { args: [string]; ret: string | null }
  'paths:userData':    { args: [];       ret: string }

  // Native dialogs that return data (not paths)
  'dialog:openPdf': { args: []; ret: { filename: string; bytes: Uint8Array } | null }
}
