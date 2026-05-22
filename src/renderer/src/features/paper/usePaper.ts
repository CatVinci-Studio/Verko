import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { HighlightColor, HighlightDraft, PaperPatch } from '@shared/types'
import { api } from '@/lib/ipc'

export function usePaperDetail(id: string | null) {
  return useQuery({
    queryKey: ['paper', id],
    queryFn: () => api.papers.get(id!),
    enabled: !!id,
    staleTime: 5000,
  })
}

export function useUpdatePaper() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: PaperPatch }) =>
      api.papers.update(id, patch),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['paper', id] })
      qc.invalidateQueries({ queryKey: ['papers'] })
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

export function useHighlights(paperId: string | null) {
  return useQuery({
    queryKey: ['highlights', paperId],
    queryFn: () => api.highlights.list(paperId!),
    enabled: !!paperId,
    staleTime: 5000,
  })
}

export function useAddHighlight(paperId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (draft: HighlightDraft) => api.highlights.add(paperId!, draft),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['highlights', paperId] })
    },
  })
}

export function useDeleteHighlight(paperId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (highlightId: string) => api.highlights.delete(paperId!, highlightId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['highlights', paperId] })
    },
  })
}

export function useUpdateHighlight(paperId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ highlightId, patch }: { highlightId: string; patch: { note?: string; color?: HighlightColor } }) =>
      api.highlights.update(paperId!, highlightId, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['highlights', paperId] })
    },
  })
}
