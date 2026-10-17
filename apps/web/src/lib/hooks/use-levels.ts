'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type {
  AssessmentMethod,
  CefrLevel,
  LevelAssessment,
  LevelOverviewResponse,
  PaginationMeta,
} from '@lingopath/types'

export interface AssessmentInput {
  cefrLevel?: CefrLevel | null
  listeningLevel?: CefrLevel | null
  readingLevel?: CefrLevel | null
  writingLevel?: CefrLevel | null
  speakingLevel?: CefrLevel | null
  assessedAt: string
  method: AssessmentMethod
  notes?: string | null
}

export interface AssessmentListResponse {
  data: LevelAssessment[]
  meta: PaginationMeta
}

export const levelKeys = {
  all: ['levels'] as const,
  overview: (limit: number) => [...levelKeys.all, 'overview', limit] as const,
}

/**
 * The whole levels view in one request: the most recently recorded level per
 * dimension plus the assessment history the chart and table are drawn from.
 */
export function useLevelOverview(limit = 50) {
  return useQuery<LevelOverviewResponse>({
    queryKey: levelKeys.overview(limit),
    queryFn: () =>
      apiClient.get<LevelOverviewResponse>(`/api/v1/assessments/overview?limit=${limit}`),
  })
}

export function useCreateAssessment() {
  const queryClient = useQueryClient()

  return useMutation<LevelAssessment, Error, AssessmentInput>({
    mutationFn: (data) => apiClient.post<LevelAssessment>('/api/v1/assessments', data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: levelKeys.all })
    },
  })
}

export function useUpdateAssessment() {
  const queryClient = useQueryClient()

  return useMutation<LevelAssessment, Error, { id: string; data: Partial<AssessmentInput> }>({
    mutationFn: ({ id, data }) => apiClient.put<LevelAssessment>(`/api/v1/assessments/${id}`, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: levelKeys.all })
    },
  })
}

export function useDeleteAssessment() {
  const queryClient = useQueryClient()

  return useMutation<void, Error, string>({
    mutationFn: (id) => apiClient.delete<void>(`/api/v1/assessments/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: levelKeys.all })
    },
  })
}
