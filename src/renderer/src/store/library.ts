import { create } from 'zustand'
import type { Filter } from '@shared/types'

/**
 * UI state for the library workspace. Server data (papers / schema /
 * collections / libraries) lives in TanStack Query — see
 * `features/library/queries.ts`. This store only holds choices the user
 * has made about *what* to see (filter, selected paper, active collection)
 * and the overall library-presence status the app boots into.
 */

export type LibraryStatus = 'loading' | 'ready' | 'none'
export type NoneReason = { reason: 'empty' | 'last-failed'; message?: string }

interface LibraryStore {
  selectedId: string | null
  activeCollection: string | null
  filter: Filter
  status: LibraryStatus
  noneReason?: NoneReason

  setSelected: (id: string | null) => void
  setFilter: (f: Partial<Filter>) => void
  setActiveCollection: (name: string | null) => void
  setStatus: (s: LibraryStatus, reason?: NoneReason) => void
}

export const useLibraryStore = create<LibraryStore>((set) => ({
  selectedId: null,
  activeCollection: null,
  filter: {},
  status: 'loading',
  noneReason: undefined,

  setSelected: (id) => set({ selectedId: id }),
  setFilter: (f) => set((s) => ({ filter: { ...s.filter, ...f } })),
  setActiveCollection: (name) => set({ activeCollection: name }),
  setStatus: (s, reason) => set({ status: s, noneReason: reason }),
}))
