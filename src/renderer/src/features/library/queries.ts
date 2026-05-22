import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Filter } from '@shared/types'
import { api } from '@/lib/ipc'
import { useLibraryStore } from '@/store/library'
import { useShallow } from 'zustand/react/shallow'

/**
 * Server-state hooks for the library workspace. These wrap `IApi` calls in
 * TanStack Query so callers don't have to think about caching, dedup, or
 * refresh — invalidation is the only thing the rest of the app touches via
 * `useInvalidateLibrary()`.
 *
 * UI state (selected paper, filter, active collection, library status) lives
 * in `store/library.ts`; this file is the data side.
 */

const KEYS = {
  libraries:   ['libraries'] as const,
  collections: ['collections'] as const,
  schema:      ['schema'] as const,
  /** `papers` is parameterized — filter + activeCollection are part of the key. */
  papers: (filter: Filter, collection: string | null) =>
    ['papers', filter, collection] as const,
}

export function useLibrariesQuery() {
  return useQuery({
    queryKey: KEYS.libraries,
    queryFn: () => api.libraries.list(),
  })
}

export function useCollectionsQuery() {
  return useQuery({
    queryKey: KEYS.collections,
    queryFn: () => api.collections.list(),
  })
}

export function useSchemaQuery() {
  return useQuery({
    queryKey: KEYS.schema,
    queryFn: () => api.schema.get(),
  })
}

export function usePapersQuery() {
  const { filter, activeCollection } = useLibraryStore(
    useShallow((s) => ({ filter: s.filter, activeCollection: s.activeCollection })),
  )
  return useQuery({
    queryKey: KEYS.papers(filter, activeCollection),
    queryFn: () => api.papers.list(filter, activeCollection ?? undefined),
  })
}

/** Convenience: derived "active library" from the libraries list. */
export function useActiveLibrary() {
  const { data } = useLibrariesQuery()
  return data?.find((l) => l.active) ?? null
}

/**
 * Centralized invalidation. Use these from mutation callers — much easier
 * to grep for than scattered `queryClient.invalidateQueries({ queryKey: ['x'] })`.
 */
export function useInvalidateLibrary() {
  const qc = useQueryClient()
  return {
    /** All library data (after switching libraries / importing zip / etc). */
    all:         () => qc.invalidateQueries(),
    libraries:   () => qc.invalidateQueries({ queryKey: KEYS.libraries }),
    collections: () => qc.invalidateQueries({ queryKey: KEYS.collections }),
    schema:      () => qc.invalidateQueries({ queryKey: KEYS.schema }),
    papers:      () => qc.invalidateQueries({ queryKey: ['papers'] }),
    paper:       (id: string) => qc.invalidateQueries({ queryKey: ['paper', id] }),
  }
}
