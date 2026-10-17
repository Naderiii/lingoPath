'use client'

import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'

export interface SkillOption {
  id: string
  name: string
  sortOrder: number
}

/**
 * The skill taxonomy, in its display order.
 *
 * The modify dialog needs the same list the rest of the app uses, so it reads the
 * taxonomy endpoint instead of hardcoding eight names — a new skill appears in the
 * picker without a frontend change.
 */
export function useSkills(enabled = true) {
  return useQuery({
    queryKey: ['skills'],
    queryFn: async () => {
      const response = await apiClient.get<{ data: SkillOption[] }>('/api/v1/skills')
      return [...response.data].sort((a, b) => a.sortOrder - b.sortOrder)
    },
    // The picker only exists inside the modify step, so the taxonomy is fetched
    // when that step opens rather than on every dashboard load.
    enabled,
    staleTime: 5 * 60_000,
  })
}
