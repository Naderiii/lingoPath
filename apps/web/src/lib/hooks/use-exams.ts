'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type {
  ExamResult,
  ExamScoreScaleListResponse,
  ExamStatus,
  ExamType,
  ExamWithScale,
  ExamScoreScaleInput,
  PaginationMeta,
} from '@lingopath/types'

export interface ExamListResponse {
  data: ExamWithScale[]
  meta: PaginationMeta
}

export interface ExamInput {
  type: ExamType
  title: string
  status?: ExamStatus
  objectiveId?: string | null
  scheduledAt?: string | null
  venue?: string | null
  targetScore?: number | null
  targetDate?: string | null
  scoreScale?: ExamScoreScaleInput | null
  notes?: string | null
}

export interface ExamResultInput {
  isMock: boolean
  takenAt: string
  overallScore?: number
  skillScores?: Record<string, number>
  notes?: string
}

export const examKeys = {
  all: ['exams'] as const,
  lists: () => [...examKeys.all, 'list'] as const,
  list: (filters?: { type?: ExamType; status?: ExamStatus }) =>
    [...examKeys.lists(), filters] as const,
  scales: () => [...examKeys.all, 'scales'] as const,
  detail: (id: string) => [...examKeys.all, 'detail', id] as const,
}

export function useExams(filters?: { type?: ExamType; status?: ExamStatus }) {
  const params = new URLSearchParams()
  if (filters?.type) params.set('type', filters.type)
  if (filters?.status) params.set('status', filters.status)
  params.set('limit', '100')
  const path = `/api/v1/exams?${params.toString()}`

  return useQuery<ExamListResponse>({
    queryKey: examKeys.list(filters),
    queryFn: () => apiClient.get<ExamListResponse>(path),
  })
}

/**
 * The built-in scoring scales and each exam type's default, straight from the API.
 * The create form renders these, so a new scale becomes available without a change
 * anywhere in the web app.
 */
export function useExamScales() {
  return useQuery<ExamScoreScaleListResponse>({
    queryKey: examKeys.scales(),
    queryFn: () => apiClient.get<ExamScoreScaleListResponse>('/api/v1/exams/scales'),
  })
}

export function useCreateExam() {
  const queryClient = useQueryClient()

  return useMutation<ExamWithScale, Error, ExamInput>({
    mutationFn: (data) => apiClient.post<ExamWithScale>('/api/v1/exams', data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: examKeys.all })
    },
  })
}

export function useUpdateExam() {
  const queryClient = useQueryClient()

  return useMutation<ExamWithScale, Error, { id: string; data: Partial<ExamInput> }>({
    mutationFn: ({ id, data }) => apiClient.put<ExamWithScale>(`/api/v1/exams/${id}`, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: examKeys.all })
    },
  })
}

export function useDeleteExam() {
  const queryClient = useQueryClient()

  return useMutation<void, Error, string>({
    mutationFn: (id) => apiClient.delete<void>(`/api/v1/exams/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: examKeys.all })
    },
  })
}

export function useAddExamResult() {
  const queryClient = useQueryClient()

  return useMutation<ExamResult, Error, { examId: string; data: ExamResultInput }>({
    mutationFn: ({ examId, data }) =>
      apiClient.post<ExamResult>(`/api/v1/exams/${examId}/results`, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: examKeys.all })
    },
  })
}
