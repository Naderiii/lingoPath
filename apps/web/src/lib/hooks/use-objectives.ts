'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type {
  ActiveObjectiveContext,
  LearningObjective,
  ObjectiveType,
} from '@lingopath/types'

export interface ObjectiveListResponse {
  data: LearningObjective[]
}

export interface ObjectiveInput {
  type: ObjectiveType
  title: string
  description?: string
  targetScore?: number
  targetDate?: string
  isActive?: boolean
}

export const objectiveKeys = {
  all: ['objectives'] as const,
  list: () => [...objectiveKeys.all, 'list'] as const,
  active: () => [...objectiveKeys.all, 'active'] as const,
}

export function useObjectives() {
  return useQuery<ObjectiveListResponse>({
    queryKey: objectiveKeys.list(),
    queryFn: () => apiClient.get<ObjectiveListResponse>('/api/v1/objectives'),
  })
}

/**
 * The objective planning should follow, plus the factual signals around it.
 *
 * `today` comes back resolved in the learner's own timezone, so views that group by
 * date use the same day the server does instead of the browser's.
 */
export function useActiveObjective() {
  return useQuery<ActiveObjectiveContext>({
    queryKey: objectiveKeys.active(),
    queryFn: () => apiClient.get<ActiveObjectiveContext>('/api/v1/objectives/active'),
  })
}

export function useSetActiveObjective() {
  const queryClient = useQueryClient()

  return useMutation<ActiveObjectiveContext, Error, string | null>({
    mutationFn: (objectiveId) =>
      apiClient.put<ActiveObjectiveContext>('/api/v1/objectives/active', { objectiveId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: objectiveKeys.all })
    },
  })
}

export function useCreateObjective() {
  const queryClient = useQueryClient()

  return useMutation<LearningObjective, Error, ObjectiveInput>({
    mutationFn: (data) => apiClient.post<LearningObjective>('/api/v1/objectives', data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: objectiveKeys.all })
    },
  })
}

export const OBJECTIVE_TYPE_LABELS: Record<ObjectiveType, string> = {
  IELTS: 'IELTS',
  TOEFL: 'TOEFL',
  GENERAL_ENGLISH: 'General English',
  IMMIGRATION: 'Immigration',
  CUSTOM: 'Custom',
}

export function objectiveTypeLabel(type: ObjectiveType): string {
  return OBJECTIVE_TYPE_LABELS[type] ?? type
}

export const SIGNAL_TONE: Record<string, string> = {
  OBJECTIVE: 'border-primary/30 bg-primary/5',
  DATA_GAP: 'border-border bg-muted/40',
  TIMELINE: 'border-amber-300/60 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20',
  RECORDED_SCORE: 'border-border bg-muted/40',
}
