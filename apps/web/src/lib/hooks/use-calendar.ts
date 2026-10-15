'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  CalendarDayDetailResponse,
  CalendarResponse,
  CalendarSettingsResponse,
  StreakSummaryResponse,
  UpdateCalendarSettingsInput,
} from '@lingopath/types'
import { apiClient } from '@/lib/api-client'

/**
 * Calendar + streak data hooks (Phase 7).
 *
 * Everything the calendar page reads flows through here so cache invalidation
 * stays in one place: saving new thresholds refreshes both the heatmap and the
 * streak cards, and the streak query is shared with the study dashboard.
 */

export interface CalendarQueryParams {
  /** Explicit year selector. Omit together with `from`/`to` for the current year. */
  year?: number
  from?: string
  to?: string
}

export interface StreakQueryParams {
  streakQualifyingMinutes?: number
}

export const calendarKeys = {
  all: ['calendar'] as const,
  ranges: () => [...calendarKeys.all, 'range'] as const,
  range: (params: CalendarQueryParams) => [...calendarKeys.ranges(), params] as const,
  days: () => [...calendarKeys.all, 'day'] as const,
  day: (date: string) => [...calendarKeys.days(), date] as const,
  settings: () => [...calendarKeys.all, 'settings'] as const,
  streaks: () => [...calendarKeys.all, 'streak'] as const,
  streak: (params: StreakQueryParams) => [...calendarKeys.streaks(), params] as const,
}

function toQueryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value))
  }
  const query = search.toString()
  return query ? `?${query}` : ''
}

export function useCalendarRange(params: CalendarQueryParams = {}) {
  const queryString = toQueryString({ year: params.year, from: params.from, to: params.to })

  return useQuery<CalendarResponse>({
    queryKey: calendarKeys.range(params),
    queryFn: () => apiClient.get<CalendarResponse>(`/api/v1/calendar${queryString}`),
    staleTime: 60_000,
  })
}

export function useCalendarDay(date: string | null) {
  return useQuery<CalendarDayDetailResponse>({
    queryKey: calendarKeys.day(date ?? ''),
    queryFn: () =>
      apiClient.get<CalendarDayDetailResponse>(`/api/v1/calendar/day/${encodeURIComponent(date!)}`),
    enabled: date !== null,
    staleTime: 30_000,
  })
}

export function useCalendarSettings() {
  return useQuery<CalendarSettingsResponse>({
    queryKey: calendarKeys.settings(),
    queryFn: () => apiClient.get<CalendarSettingsResponse>('/api/v1/calendar/settings'),
    staleTime: 5 * 60_000,
  })
}

export function useStreak(params: StreakQueryParams = {}) {
  const queryString = toQueryString({ streakQualifyingMinutes: params.streakQualifyingMinutes })

  return useQuery<StreakSummaryResponse>({
    queryKey: calendarKeys.streak(params),
    queryFn: () => apiClient.get<StreakSummaryResponse>(`/api/v1/streak${queryString}`),
    staleTime: 60_000,
  })
}

export function useUpdateCalendarSettings() {
  const queryClient = useQueryClient()

  return useMutation<CalendarSettingsResponse, Error, UpdateCalendarSettingsInput>({
    mutationFn: (input) =>
      apiClient.put<CalendarSettingsResponse>('/api/v1/calendar/settings', input),
    onSuccess: () => {
      // Thresholds change every bucket boundary, so refresh the whole calendar
      // surface rather than a single key.
      void queryClient.invalidateQueries({ queryKey: calendarKeys.all })
      void queryClient.invalidateQueries({ queryKey: ['sessions', 'today-stats'] })
    },
  })
}
