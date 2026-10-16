'use client'

import { useQuery } from '@tanstack/react-query'
import type { AnalyticsPayload, AnalyticsRangeKind } from '@lingopath/types'
import { apiClient } from '@/lib/api-client'

/**
 * Analytics data hook (Phase 8). One consolidated request per range keeps the
 * page consistent — every section describes the same window.
 */

export interface AnalyticsQueryParams {
  range: AnalyticsRangeKind
  from?: string
  to?: string
}

export const analyticsKeys = {
  all: ['analytics'] as const,
  payload: (params: AnalyticsQueryParams) => [...analyticsKeys.all, params] as const,
}

export function useAnalytics(params: AnalyticsQueryParams) {
  const search = new URLSearchParams({ range: params.range })
  if (params.from) search.set('from', params.from)
  if (params.to) search.set('to', params.to)

  return useQuery<AnalyticsPayload>({
    queryKey: analyticsKeys.payload(params),
    queryFn: () => apiClient.get<AnalyticsPayload>(`/api/v1/analytics?${search.toString()}`),
    staleTime: 60_000,
    enabled: params.range !== 'custom' || (!!params.from && !!params.to),
  })
}
