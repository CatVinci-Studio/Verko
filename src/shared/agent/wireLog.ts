import type { NormalizedMessage, StreamEvent, ToolDef } from './providers'

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

class WireLogStore {
  private entries: WireLogEntry[] = []
  private listeners = new Set<Listener>()

  list(): WireLogEntry[] {
    return this.entries
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  start(input: Omit<WireLogEntry, 'id' | 'startedAt' | 'events'>): string {
    const entry: WireLogEntry = {
      id: `wire-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      startedAt: Date.now(),
      events: [],
      ...input,
    }
    // Newest first; cap.
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
