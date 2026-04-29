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
  pdf?: string              // relative path under library root
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

export type AgentEventType = 'text' | 'tool_start' | 'tool_result' | 'error' | 'done'

export interface AgentTextEvent    { type: 'text';        delta: string }
export interface AgentToolStart    { type: 'tool_start';  name: string; args: unknown }
export interface AgentToolResult   { type: 'tool_result'; name: string; result: unknown }
export interface AgentErrorEvent   { type: 'error';       message: string }
export interface AgentDoneEvent    { type: 'done' }

export type AgentEvent =
  | AgentTextEvent
  | AgentToolStart
  | AgentToolResult
  | AgentErrorEvent
  | AgentDoneEvent

export interface AgentProfile {
  name: string
  baseUrl: string
  model: string
  hasKey: boolean
}

export interface AgentConfig {
  defaultProfile: string
  profiles: Omit<AgentProfile, 'hasKey'>[]
  maxTurns: number
  temperature: number
  showToolCalls: boolean
}

// ─── Collections ─────────────────────────────────────────────────────────────

export interface CollectionInfo {
  name: string
  paperCount: number
}

// ─── Library management ──────────────────────────────────────────────────────

export interface LibraryInfo {
  name: string        // display name, unique key
  path: string        // absolute path to library root
  active: boolean
  paperCount: number
  createdAt: string
}

export interface LibraryConfig {
  libraries: Omit<LibraryInfo, 'active' | 'paperCount'>[]
  active: string      // name of active library
}

// ─── IPC channel map (main ↔ renderer) ───────────────────────────────────────

export interface IpcChannels {
  // Libraries (multi-library management)
  'libraries:list':     { args: [];                         ret: LibraryInfo[] }
  'libraries:switch':   { args: [string];                   ret: void }         // name
  'libraries:add':      { args: [string, string];           ret: LibraryInfo }  // name, path
  'libraries:create':   { args: [string, string];           ret: LibraryInfo }  // name, path (mkdir)
  'libraries:remove':   { args: [string];                   ret: void }         // name (unregisters, no delete)
  'libraries:rename':   { args: [string, string];           ret: void }         // oldName, newName

  // Collections (within active library)
  'collections:list':    { args: [];                        ret: CollectionInfo[] }
  'collections:create':  { args: [string];                  ret: void }
  'collections:delete':  { args: [string];                  ret: void }
  'collections:rename':  { args: [string, string];          ret: void }
  'collections:addPaper':    { args: [PaperId, string];     ret: void }
  'collections:removePaper': { args: [PaperId, string];     ret: void }

  // Papers (operate on active library)
  'papers:list':         { args: [Filter?, string?];        ret: PaperRef[] }  // optional collection name
  'papers:get':          { args: [PaperId];                 ret: PaperDetail }
  'papers:add':          { args: [PaperDraft];              ret: PaperId }
  'papers:update':       { args: [PaperId, PaperPatch];     ret: void }
  'papers:delete':       { args: [PaperId];                 ret: void }
  'papers:search':       { args: [string, Filter?];         ret: SearchHit[] }
  'papers:importDoi':    { args: [string];                  ret: PaperId }
  'papers:importPdf':    { args: [string];                  ret: PaperId }

  // Schema (active library)
  'schema:get':          { args: [];                        ret: Schema }
  'schema:addColumn':    { args: [Column];                  ret: void }
  'schema:removeColumn': { args: [string];                  ret: void }
  'schema:renameColumn': { args: [string, string];          ret: void }

  // Agent
  'agent:send':          { args: [string, PaperId?];        ret: void }
  'agent:abort':         { args: [];                        ret: void }
  'agent:getConfig':     { args: [];                        ret: AgentConfig }
  'agent:setProfile':    { args: [string];                  ret: void }
  'agent:saveKey':       { args: [string, string];          ret: void }
  'agent:testKey':       { args: [string];                  ret: boolean }
  'agent:getProfiles':   { args: [];                        ret: AgentProfile[] }

  // PDF
  'pdf:getPath':         { args: [PaperId];                 ret: string | null }
}

// Streaming events (main → renderer via ipcRenderer.on)
export interface IpcEvents {
  'agent:event':      AgentEvent
  'library:switched': LibraryInfo   // broadcast when active library changes
}
