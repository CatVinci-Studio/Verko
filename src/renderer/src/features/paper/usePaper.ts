import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { PaperPatch } from '@shared/types'
import { api } from '@/lib/ipc'
import { useLibraryStore } from '@/store/library'

export function usePaperDetail(id: string | null) {
  return useQuery({
    queryKey: ['paper', id],
    queryFn: () => api.papers.get(id!),
    enabled: !!id,
    staleTime: 5000,
  })
}

export function useUpdatePaper() {
  const queryClient = useQueryClient()
  const refreshPapers = useLibraryStore(s => s.refreshPapers)

  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: PaperPatch }) =>
      api.papers.update(id, patch),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['paper', id] })
      refreshPapers()
    },
  })
}

export function usePdfPath(id: string | null) {
  return useQuery({
    queryKey: ['pdf-path', id],
    queryFn: () => api.pdf.getPath(id!),
    enabled: !!id,
    staleTime: 60000,
  })
}
