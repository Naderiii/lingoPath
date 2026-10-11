'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type { PlanStatus } from '@lingopath/types'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PlanListItem {
  id: string
  userId: string
  title: string
  description: string | null
  startDate: string
  endDate: string
  targetMinutes: number
  status: PlanStatus
  objectiveId: string | null
  examId: string | null
  createdAt: string
  updatedAt: string
  remainingDays: number
  actualMinutes: number
  studyProgressPercent: number
  objective?: {
    id: string
    title: string
    type: string
  } | null
  milestones?: Array<{
    id: string
    title: string
    status: string
    ordering: number
  }>
}

export interface PlanDetail extends PlanListItem {
  exam?: {
    id: string
    title: string
    type: string
  } | null
}

export interface PlanProgress {
  totalDays: number
  elapsedDays: number
  remainingDays: number
  timeProgressPercent: number
  targetMinutes: number
  actualMinutes: number
  remainingMinutes: number
  studyProgressPercent: number
  targetFormatted: string
  actualFormatted: string
  remainingFormatted: string
  isOverTarget: boolean
}

export interface MilestoneProgress {
  milestoneId: string
  title: string
  description: string | null
  startDate: string
  endDate: string
  targetMinutes: number
  actualMinutes: number
  remainingMinutes: number
  progressPercent: number
  remainingDays: number
  status: string
  ordering: number
  isCurrent: boolean
  isNext: boolean
}

export interface PlanProgressResponse {
  plan: PlanDetail
  progress: PlanProgress
  milestones: MilestoneProgress[]
  weeklyProgress: Array<{ weekStart: string; totalMinutes: number }>
  monthlyProgress: Array<{ month: string; totalMinutes: number }>
}

export interface PlanListResponse {
  data: PlanListItem[]
  meta: {
    nextCursor: string | null
    hasMore: boolean
    limit: number
  }
}

export interface MilestoneWithProgress {
  id: string
  planId: string
  title: string
  description: string | null
  startDate: string
  endDate: string
  targetMinutes: number
  status: string
  ordering: number
  actualMinutes: number
  remainingDays: number
  progressPercent: number
  skill?: { id: string; name: string } | null
}

export interface CreatePlanInput {
  title: string
  description?: string
  startDate: string
  endDate: string
  targetMinutes: number
  status?: PlanStatus
  objectiveId?: string
  examId?: string
}

export interface UpdatePlanInput {
  title?: string
  description?: string | null
  startDate?: string
  endDate?: string
  targetMinutes?: number
  status?: PlanStatus
  objectiveId?: string | null
  examId?: string | null
}

export interface CreateMilestoneInput {
  title: string
  description?: string
  startDate: string
  endDate: string
  targetMinutes: number
  skillId?: string
  status?: PlanStatus
  ordering?: number
}

export interface UpdateMilestoneInput {
  title?: string
  description?: string | null
  startDate?: string
  endDate?: string
  targetMinutes?: number
  skillId?: string | null
  status?: PlanStatus
  ordering?: number
}

// ─── Query Keys ──────────────────────────────────────────────────────────────

export const planKeys = {
  all: ['plans'] as const,
  lists: () => [...planKeys.all, 'list'] as const,
  list: (filters?: { status?: PlanStatus }) => [...planKeys.lists(), filters] as const,
  details: () => [...planKeys.all, 'detail'] as const,
  detail: (id: string) => [...planKeys.details(), id] as const,
  progress: (id: string) => [...planKeys.all, 'progress', id] as const,
  milestones: (planId: string) => [...planKeys.all, 'milestones', planId] as const,
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

export function usePlans(status?: PlanStatus) {
  const params = new URLSearchParams()
  if (status) params.set('status', status)
  const qs = params.toString()
  const path = `/api/v1/plans${qs ? `?${qs}` : ''}`

  return useQuery<PlanListResponse>({
    queryKey: planKeys.list(status ? { status } : undefined),
    queryFn: () => apiClient.get<PlanListResponse>(path),
  })
}

export function usePlan(id: string | undefined) {
  return useQuery<PlanDetail>({
    queryKey: planKeys.detail(id ?? ''),
    queryFn: () => apiClient.get<PlanDetail>(`/api/v1/plans/${id}`),
    enabled: !!id,
  })
}

export function usePlanProgress(id: string | undefined) {
  return useQuery<PlanProgressResponse>({
    queryKey: planKeys.progress(id ?? ''),
    queryFn: () => apiClient.get<PlanProgressResponse>(`/api/v1/plans/${id}/progress`),
    enabled: !!id,
  })
}

export function usePlanMilestones(planId: string | undefined) {
  return useQuery<MilestoneWithProgress[]>({
    queryKey: planKeys.milestones(planId ?? ''),
    queryFn: () => apiClient.get<MilestoneWithProgress[]>(`/api/v1/plans/${planId}/milestones`),
    enabled: !!planId,
  })
}

export function useCreatePlan() {
  const queryClient = useQueryClient()
  return useMutation<PlanDetail, Error, CreatePlanInput>({
    mutationFn: (data) => apiClient.post<PlanDetail>('/api/v1/plans', data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: planKeys.all })
    },
  })
}

export function useUpdatePlan() {
  const queryClient = useQueryClient()
  return useMutation<PlanDetail, Error, { id: string; data: UpdatePlanInput }>({
    mutationFn: ({ id, data }) => apiClient.put<PlanDetail>(`/api/v1/plans/${id}`, data),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: planKeys.detail(variables.id) })
      void queryClient.invalidateQueries({ queryKey: planKeys.progress(variables.id) })
      void queryClient.invalidateQueries({ queryKey: planKeys.lists() })
    },
  })
}

export function useDeletePlan() {
  const queryClient = useQueryClient()
  return useMutation<void, Error, string>({
    mutationFn: (id) => apiClient.delete<void>(`/api/v1/plans/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: planKeys.all })
    },
  })
}

export function useCreateMilestone() {
  const queryClient = useQueryClient()
  return useMutation<MilestoneWithProgress, Error, { planId: string; data: CreateMilestoneInput }>({
    mutationFn: ({ planId, data }) =>
      apiClient.post<MilestoneWithProgress>(`/api/v1/plans/${planId}/milestones`, data),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: planKeys.milestones(variables.planId) })
      void queryClient.invalidateQueries({ queryKey: planKeys.progress(variables.planId) })
      void queryClient.invalidateQueries({ queryKey: planKeys.detail(variables.planId) })
    },
  })
}

export function useUpdateMilestone() {
  const queryClient = useQueryClient()
  return useMutation<
    MilestoneWithProgress,
    Error,
    { id: string; planId: string; data: UpdateMilestoneInput }
  >({
    mutationFn: ({ id, data }) =>
      apiClient.put<MilestoneWithProgress>(`/api/v1/milestones/${id}`, data),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: planKeys.milestones(variables.planId) })
      void queryClient.invalidateQueries({ queryKey: planKeys.progress(variables.planId) })
    },
  })
}

export function useDeleteMilestone() {
  const queryClient = useQueryClient()
  return useMutation<void, Error, { id: string; planId: string }>({
    mutationFn: ({ id }) => apiClient.delete<void>(`/api/v1/milestones/${id}`),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: planKeys.milestones(variables.planId) })
      void queryClient.invalidateQueries({ queryKey: planKeys.progress(variables.planId) })
      void queryClient.invalidateQueries({ queryKey: planKeys.detail(variables.planId) })
    },
  })
}

// ─── Utility Helpers (client-side) ───────────────────────────────────────────

/** Compute remaining days dynamically on the client. */
export function computeRemainingDaysClient(endDateStr: string): number {
  const now = new Date()
  const end = new Date(endDateStr)
  const diffMs = end.getTime() - now.getTime()
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))
}

/** Format minutes for display as "Xh Ym" */
export function formatMinutesDisplay(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

/** Get status display label and color */
export function getPlanStatusDisplay(status: PlanStatus): {
  label: string
  className: string
} {
  switch (status) {
    case 'ACTIVE':
      return { label: 'Active', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' }
    case 'COMPLETED':
      return { label: 'Completed', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' }
    case 'ARCHIVED':
      return { label: 'Archived', className: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400' }
    case 'CANCELLED':
      return { label: 'Cancelled', className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' }
  }
}
