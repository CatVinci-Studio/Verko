// In-memory undo stack for highlight create/delete actions. Lives outside
// React state so toasts triggered from anywhere (selection toolbar, click
// handlers, popover) can register and trigger undo without prop drilling.
//
// Bounded to 20 entries — older actions silently drop off. Cross-page
// selections register as a single entry covering the whole group.

import { create } from 'zustand'
import { randomId } from '@shared/util/randomId'

interface UndoEntry {
  id: string
  /** Plain summary for the toast — e.g. "1 highlight" or "3 highlights (cross-page)". */
  label: string
  /** Reverses the action. Returning a promise keeps the toast "Undoing…" state honest. */
  undo: () => Promise<void>
  /** When this entry was created — for auto-dismiss. */
  expiresAt: number
}

interface UndoStore {
  entry: UndoEntry | null
  push: (label: string, undo: () => Promise<void>, ttlMs?: number) => void
  /** Run the current undo and clear it. */
  trigger: () => Promise<void>
  dismiss: () => void
}

export const useUndoStore = create<UndoStore>((set, get) => ({
  entry: null,
  push: (label, undo, ttlMs = 6000) => {
    const id = randomId(4)
    const entry: UndoEntry = { id, label, undo, expiresAt: Date.now() + ttlMs }
    set({ entry })
    setTimeout(() => {
      const cur = get().entry
      if (cur && cur.id === id) set({ entry: null })
    }, ttlMs)
  },
  trigger: async () => {
    const cur = get().entry
    if (!cur) return
    set({ entry: null })
    try { await cur.undo() } catch { /* surface via the next action's success/failure */ }
  },
  dismiss: () => set({ entry: null }),
}))

