import type { NormalizedMessage, StreamEvent, ToolDef } from './providers'
import { randomId } from '@shared/util/randomId'

/**
 * In-memory ring buffer of LLM API request/response pairs. Used by the
 * Settings → Debug tab to inspect what's actually being sent over the
 * wire and what came back. Useful for diagnosing provider-specific
 * quirks (e.g. tool-call payload validation errors) without dropping
 * to console.log.
 *
 * Modeled on DG-Agent's ModelLogTurn but trimmed: in-memory only (no
 * localStorage), capped to MAX_ENTRIES, no per-session bucket since
 * Verko is single-session.
 */

const MAX_ENTRIES = 50

export interface WireLogEntry {
  id: string
  startedAt: number
  durationMs?: number

  /** Provider identity. */
  protocol: string
  model: string
  baseUrl?: string

  /**
   * Provider-neutral snapshot of what the agent passed in. Useful even
   * if `rawRequest` doesn't get filled (e.g. a provider that fails
   * before constructing the wire body).
   */
  request: {
    systemPrompt: string
    messages: NormalizedMessage[]
    tools: Pick<ToolDef, 'name' | 'description'>[]
    temperature: number
  }

  /** Vendor-specific JSON body that the SDK sent. May be missing on early failure. */
  rawRequest?: unknown

  /** Streamed events as they came in, in order. */
  events: StreamEvent[]

  /** Final stop reason if reported by the provider. */
  finishReason?: string

  /** Error message if the stream threw. */
  error?: string
}

type Listener = () => void

const ENABLED_LS_KEY = 'verko:wirelog-enabled'

class WireLogStore {
  private entries: WireLogEntry[] = []
  private listeners = new Set<Listener>()
  private enabled: boolean

  constructor() {
    // Default ON to preserve historical behaviour. The user can opt out via
    // Settings → Debug; the choice persists across sessions.
    const v = typeof localStorage !== 'undefined' ? localStorage.getItem(ENABLED_LS_KEY) : null
    this.enabled = v !== '0'
  }

  list(): WireLogEntry[] {
    return this.entries
  }

  isEnabled(): boolean {
    return this.enabled
  }

  setEnabled(value: boolean): void {
    if (this.enabled === value) return
    this.enabled = value
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(ENABLED_LS_KEY, value ? '1' : '0')
    }
    this.notify()
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  start(input: Omit<WireLogEntry, 'id' | 'startedAt' | 'events'>): string {
    // Disabled: return a sentinel id. The other methods look entries up by
    // id and become no-ops when nothing matches.
    if (!this.enabled) return ''
    const entry: WireLogEntry = {
      id: `wire-${Date.now()}-${randomId(4)}`,
      startedAt: Date.now(),
      events: [],
      ...input,
    }
    this.entries = [entry, ...this.entries].slice(0, MAX_ENTRIES)
    this.notify()
    return entry.id
  }

  setRawRequest(id: string, raw: unknown): void {
    const idx = this.entries.findIndex((e) => e.id === id)
    if (idx === -1) return
    this.entries = this.entries.map((e, i) => (i === idx ? { ...e, rawRequest: raw } : e))
    this.notify()
  }

  appendEvent(id: string, event: StreamEvent): void {
    const idx = this.entries.findIndex((e) => e.id === id)
    if (idx === -1) return
    this.entries = this.entries.map((e, i) =>
      i === idx ? { ...e, events: [...e.events, event] } : e,
    )
    this.notify()
  }

  finish(id: string, opts?: { error?: string; finishReason?: string }): void {
    const idx = this.entries.findIndex((e) => e.id === id)
    if (idx === -1) return
    const now = Date.now()
    this.entries = this.entries.map((e, i) =>
      i === idx
        ? {
            ...e,
            durationMs: now - e.startedAt,
            error: opts?.error,
            finishReason: opts?.finishReason,
          }
        : e,
    )
    this.notify()
  }

  clear(): void {
    this.entries = []
    this.notify()
  }

  private notify(): void {
    for (const l of this.listeners) l()
  }
}

export const wireLog = new WireLogStore()
