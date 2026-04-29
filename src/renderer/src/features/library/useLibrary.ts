import { useQuery } from '@tanstack/react-query'
import type { Filter } from '@shared/types'
import { api } from '@/lib/ipc'

export function usePaperList(filter?: Filter) {
  return useQuery({
    queryKey: ['papers', 'list', filter],
    queryFn: () => api.papers.list(filter),
    staleTime: 5000,
  })
}

export function useLibraries() {
  return useQuery({
    queryKey: ['libraries'],
    queryFn: () => api.libraries.list(),
    staleTime: 10000,
  })
}
