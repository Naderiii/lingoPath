'use client'

/**
 * Query and mutation hooks for recommendations (Phase 11).
 *
 * The mutations are deliberately small: they record a decision, or they write the
 * one confirmed plan item, and they invalidate what actually changed. A decision
 * does not invalidate goals or the dashboard, because a decision does not touch
 * them — only `apply` does. That asymmetry is the phase's core rule, expressed in
 * cache invalidation instead of a comment.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type {
  ApplyRecommendation,
  Recommendation,
  RecommendationAction,
  RecommendationFollowUp,
  RecommendationGeneration,
  RecommendationHistoryEntry,
} from '@lingopath/types'

export interface RecommendationListResponse {
  data: Recommendation[]
  meta: { count: number; limit: number }
}

export interface RecommendationHistoryResponse {
  data: RecommendationHistoryEntry[]
  meta: { count: number; limit: number }
}

export interface RecommendationFeedbackResponse {
  data: Recommendation
  meta: { followUp: RecommendationFollowUp | null }
}

export interface RecommendationApplyResponse {
  data: Recommendation
  meta: { goalId: string }
}

export const recommendationKeys = {
  all: ['recommendations'] as const,
  actionable: () => [...recommendationKeys.all, 'actionable'] as const,
  history: (limit: number, action?: RecommendationAction) =>
    [...recommendationKeys.all, 'history', limit, action ?? 'ALL'] as const,
}

const ACTIONABLE_LIMIT = 20

/**
 * Everything the learner can still act on: new rows plus accepted-but-unapplied
 * ones. The filter runs in SQL, so an old batch of decided rows cannot push an
 * open suggestion off the page.
 */
export function useActionableRecommendations() {
  return useQuery<RecommendationListResponse>({
    queryKey: recommendationKeys.actionable(),
    queryFn: () =>
      apiClient.get<RecommendationListResponse>(
        `/api/v1/recommendations?actionable=true&limit=${ACTIONABLE_LIMIT}`,
      ),
    staleTime: 15_000,
    retry: 1,
  })
}

export function useRecommendationHistory(limit = 30, action?: RecommendationAction) {
  const query = action === undefined ? '' : `&action=${action}`
  return useQuery<RecommendationHistoryResponse>({
    queryKey: recommendationKeys.history(limit, action),
    queryFn: () =>
      apiClient.get<RecommendationHistoryResponse>(
        `/api/v1/recommendations/history?limit=${limit}${query}`,
      ),
    // Keep the current table on screen while another filter loads, so the
    // controls never disappear under the pointer.
    placeholderData: (previous) => previous,
    staleTime: 15_000,
    retry: 1,
  })
}

/**
 * Records a decision. This is the only thing the Accept/Reject/Later actions do
 * before a confirmation — no planning data is written by this hook.
 */
export function useRecommendationFeedback() {
  const queryClient = useQueryClient()

  return useMutation<
    RecommendationFeedbackResponse,
    Error,
    { id: string; action: RecommendationAction; reason?: string }
  >({
    mutationFn: ({ id, action, reason }) =>
      apiClient.post<RecommendationFeedbackResponse>(`/api/v1/recommendations/${id}/feedback`, {
        action,
        ...(reason !== undefined && reason.trim().length > 0 ? { reason } : {}),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: recommendationKeys.all })
    },
  })
}

/**
 * The optional action: writes exactly one daily goal for the picked day.
 *
 * Only the confirmation dialog calls this, and only with `confirm: true` from
 * `toApplyInput`. Goals and the dashboard are invalidated because those numbers
 * genuinely changed; nothing else is.
 */
export function useApplyRecommendation() {
  const queryClient = useQueryClient()

  return useMutation<
    RecommendationApplyResponse,
    Error,
    { id: string; input: ApplyRecommendation }
  >({
    mutationFn: ({ id, input }) =>
      apiClient.post<RecommendationApplyResponse>(`/api/v1/recommendations/${id}/apply`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: recommendationKeys.all })
      void queryClient.invalidateQueries({ queryKey: ['goals'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

/** A fresh batch. User-initiated: opening a page never spends a model call. */
export function useGenerateRecommendations() {
  const queryClient = useQueryClient()

  return useMutation<{ data: Recommendation[]; meta: RecommendationGeneration }, Error, void>({
    mutationFn: () =>
      apiClient.post<{ data: Recommendation[]; meta: RecommendationGeneration }>(
        '/api/v1/recommendations/generate',
        {},
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: recommendationKeys.all })
    },
  })
}
