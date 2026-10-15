'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SessionSkill {
  id: string
  name: string
  description: string | null
  isDefault: boolean
  sortOrder: number
}

export interface SessionCategory {
  id: string
  userId: string | null
  name: string
  description: string | null
  isDefault: boolean
  sortOrder: number
}

export interface StudySessionItem {
  id: string
  userId: string
  skillId: string
  categoryId: string | null
  topic: string | null
  description: string | null
  startedAt: string
  endedAt: string
  durationMinutes: number
  selfRating: number | null
  notes: string | null
  isManual: boolean
  planId: string | null
  milestoneId: string | null
  createdAt: string
  updatedAt: string
  skill: SessionSkill
  category: SessionCategory | null
}

export interface SessionListResponse {
  data: StudySessionItem[]
  meta: {
    nextCursor: string | null
    hasMore: boolean
    limit: number
  }
}

export interface TodayStatsResponse {
  todayTotalMinutes: number
  dailyTargetMinutes: number
  remainingMinutes: number
  streak: number
  /** Phase 7: the canonical streak reader also reports the longest run and the rule. */
  longestStreak?: number
  streakQualifyingMinutes?: number
  todayQualified?: boolean
  todayPending?: boolean
  minutesToQualifyToday?: number
  sessions: StudySessionItem[]
}

export interface CreateSessionInput {
  skillId: string
  categoryId?: string
  topic?: string
  description?: string
  startedAt: string
  endedAt: string
  selfRating?: number
  notes?: string
  isManual: boolean
  planId?: string
  milestoneId?: string
}

export interface UpdateSessionInput {
  skillId?: string
  categoryId?: string | null
  topic?: string | null
  description?: string | null
  startedAt?: string
  endedAt?: string
  selfRating?: number | null
  notes?: string | null
  isManual?: boolean
}

export interface SessionFilters {
  cursor?: string
  limit?: number
  skillId?: string
  categoryId?: string
  from?: string
  to?: string
  search?: string
  sortBy?: 'startedAt' | 'durationMinutes' | 'createdAt'
  sortOrder?: 'asc' | 'desc'
}

// ─── Query Keys ──────────────────────────────────────────────────────────────

export const sessionKeys = {
  all: ['sessions'] as const,
  lists: () => [...sessionKeys.all, 'list'] as const,
  list: (filters?: SessionFilters) => [...sessionKeys.lists(), filters] as const,
  details: () => [...sessionKeys.all, 'detail'] as const,
  detail: (id: string) => [...sessionKeys.details(), id] as const,
  todayStats: () => [...sessionKeys.all, 'today-stats'] as const,
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

export function useSessions(filters?: SessionFilters) {
  const params = new URLSearchParams()
  if (filters?.cursor) params.set('cursor', filters.cursor)
  if (filters?.limit) params.set('limit', String(filters.limit))
  if (filters?.skillId) params.set('skillId', filters.skillId)
  if (filters?.categoryId) params.set('categoryId', filters.categoryId)
  if (filters?.from) params.set('from', filters.from)
  if (filters?.to) params.set('to', filters.to)
  if (filters?.search) params.set('search', filters.search)
  if (filters?.sortBy) params.set('sortBy', filters.sortBy)
  if (filters?.sortOrder) params.set('sortOrder', filters.sortOrder)

  const qs = params.toString()
  const path = `/api/v1/sessions${qs ? `?${qs}` : ''}`

  return useQuery<SessionListResponse>({
    queryKey: sessionKeys.list(filters),
    queryFn: () => apiClient.get<SessionListResponse>(path),
  })
}

export function useSession(id: string | undefined) {
  return useQuery<StudySessionItem>({
    queryKey: sessionKeys.detail(id ?? ''),
    queryFn: () => apiClient.get<StudySessionItem>(`/api/v1/sessions/${id}`),
    enabled: !!id,
  })
}

export function useTodayStats() {
  return useQuery<TodayStatsResponse>({
    queryKey: sessionKeys.todayStats(),
    queryFn: () => apiClient.get<TodayStatsResponse>('/api/v1/sessions/today-stats'),
    refetchInterval: 60_000, // Refresh every minute
  })
}

export function useCreateSession() {
  const queryClient = useQueryClient()
  return useMutation<StudySessionItem, Error, CreateSessionInput>({
    mutationFn: (data) => apiClient.post<StudySessionItem>('/api/v1/sessions', data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sessionKeys.all })
    },
  })
}

export function useUpdateSession() {
  const queryClient = useQueryClient()
  return useMutation<StudySessionItem, Error, { id: string; data: UpdateSessionInput }>({
    mutationFn: ({ id, data }) =>
      apiClient.put<StudySessionItem>(`/api/v1/sessions/${id}`, data),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: sessionKeys.detail(variables.id) })
      void queryClient.invalidateQueries({ queryKey: sessionKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: sessionKeys.todayStats() })
    },
  })
}

export function useDeleteSession() {
  const queryClient = useQueryClient()
  return useMutation<void, Error, string>({
    mutationFn: (id) => apiClient.delete<void>(`/api/v1/sessions/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sessionKeys.all })
    },
  })
}

// ─── Skills & Categories Hooks ───────────────────────────────────────────────

export function useSkills() {
  return useQuery<SessionSkill[]>({
    queryKey: ['skills'],
    queryFn: async () => {
      const response = await apiClient.get<{ data: SessionSkill[] }>('/api/v1/skills')
      return response.data
    },
  })
}

export function useCategories() {
  return useQuery<SessionCategory[]>({
    queryKey: ['categories'],
    queryFn: async () => {
      const response = await apiClient.get<{ data: SessionCategory[] }>('/api/v1/categories')
      return response.data
    },
  })
}

// ─── Utility Helpers ─────────────────────────────────────────────────────────

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

export function formatTimerDisplay(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`
  return `${pad(m)}:${pad(s)}`
}
