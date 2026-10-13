'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type { GoalPeriod } from '@lingopath/types'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GoalSkillTarget {
  id: string
  goalId: string
  skillId: string
  targetMinutes: number
  skill: {
    id: string
    name: string
  }
}

export interface Goal {
  id: string
  userId: string
  period: GoalPeriod
  targetMinutes: number
  startDate: string
  endDate: string | null
  isActive: boolean
  planId: string | null
  objectiveId: string | null
  createdAt: string
  updatedAt: string
  skillTargets?: GoalSkillTarget[]
  plan?: {
    id: string
    title: string
  } | null
  objective?: {
    id: string
    title: string
  } | null
}

export interface GoalProgress {
  targetMinutes: number
  actualMinutes: number
  remainingMinutes: number
  percentage: number
  status: 'completed' | 'in_progress' | 'not_started'
  skillProgress: Array<{
    targetMinutes: number
    actualMinutes: number
    skill: { id: string; name: string }
  }>
}

export interface GoalWithProgress extends Goal {
  progress: GoalProgress
}

export interface GoalListResponse {
  data: Goal[]
  meta: {
    nextCursor: string | null
    hasMore: boolean
    limit: number
  }
}

export interface GoalWithProgressListResponse {
  data: GoalWithProgress[]
  meta: {
    nextCursor: string | null
    hasMore: boolean
    limit: number
  }
}

export interface CreateGoalInput {
  period: GoalPeriod
  targetMinutes: number
  startDate: string
  endDate?: string
  isActive?: boolean
  planId?: string
  objectiveId?: string
  skillTargets?: Array<{
    skillId: string
    targetMinutes: number
  }>
}

export interface UpdateGoalInput {
  period?: GoalPeriod
  targetMinutes?: number
  startDate?: string
  endDate?: string | null
  isActive?: boolean
  planId?: string | null
  objectiveId?: string | null
  skillTargets?: Array<{
    skillId: string
    targetMinutes: number
  }>
}

// ─── Query Keys ──────────────────────────────────────────────────────────────

export const goalKeys = {
  all: ['goals'] as const,
  lists: () => [...goalKeys.all, 'list'] as const,
  list: (filters?: { period?: GoalPeriod; isActive?: boolean }) =>
    [...goalKeys.lists(), filters] as const,
  details: () => [...goalKeys.all, 'detail'] as const,
  detail: (id: string) => [...goalKeys.details(), id] as const,
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

export function useGoals(period?: GoalPeriod, isActive?: boolean) {
  const params = new URLSearchParams()
  if (period) params.set('period', period)
  if (isActive !== undefined) params.set('isActive', String(isActive))
  params.set('includeProgress', 'true')
  const qs = params.toString()
  const path = `/api/v1/goals${qs ? `?${qs}` : ''}`

  return useQuery<GoalWithProgressListResponse>({
    queryKey: goalKeys.list(period || isActive !== undefined ? { period, isActive } : undefined),
    queryFn: () => apiClient.get<GoalWithProgressListResponse>(path),
  })
}

export function useGoal(id: string | undefined, includeProgress: boolean = true) {
  const params = new URLSearchParams()
  if (includeProgress) params.set('includeProgress', 'true')
  const qs = params.toString()
  const path = `/api/v1/goals/${id}${qs ? `?${qs}` : ''}`

  return useQuery<GoalWithProgress>({
    queryKey: goalKeys.detail(id ?? ''),
    queryFn: () => apiClient.get<GoalWithProgress>(path),
    enabled: !!id,
  })
}

export function useCreateGoal() {
  const queryClient = useQueryClient()
  return useMutation<Goal, Error, CreateGoalInput>({
    mutationFn: (data) => apiClient.post<Goal>('/api/v1/goals', data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: goalKeys.all })
    },
  })
}

export function useUpdateGoal() {
  const queryClient = useQueryClient()
  return useMutation<Goal, Error, { id: string; data: UpdateGoalInput }>({
    mutationFn: ({ id, data }) => apiClient.put<Goal>(`/api/v1/goals/${id}`, data),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: goalKeys.detail(variables.id) })
      void queryClient.invalidateQueries({ queryKey: goalKeys.lists() })
    },
  })
}

export function useDeleteGoal() {
  const queryClient = useQueryClient()
  return useMutation<void, Error, string>({
    mutationFn: (id) => apiClient.delete<void>(`/api/v1/goals/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: goalKeys.all })
    },
  })
}

// ─── Utility Helpers ─────────────────────────────────────────────────────────

export function getGoalPeriodLabel(period: GoalPeriod): string {
  switch (period) {
    case 'DAILY':
      return 'Daily'
    case 'WEEKLY':
      return 'Weekly'
    case 'MONTHLY':
      return 'Monthly'
    case 'YEARLY':
      return 'Yearly'
  }
}

export function getGoalStatusDisplay(status: string): {
  label: string
  className: string
} {
  switch (status) {
    case 'completed':
      return {
        label: 'Completed',
        className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      }
    case 'in_progress':
      return {
        label: 'In Progress',
        className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
      }
    case 'not_started':
      return {
        label: 'Not Started',
        className: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
      }
    default:
      return {
        label: 'Unknown',
        className: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
      }
  }
}

export function formatMinutesDisplay(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}
