'use client'

import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../api-client'

export interface DashboardData {
  today: {
    studyTime: number
    studyTimeFormatted: string
    dailyTarget: number
    dailyTargetFormatted: string
    remainingTarget: number
    remainingTargetFormatted: string
    hasDailyGoal: boolean
    sessions: number
    currentStreak: number
  }
  activePlan: {
    id: string
    name: string
    objective: string | null
    startDate: string
    endDate: string
    remainingDays: number
    elapsedDays: number
    totalDays: number
    studyProgress: number
    target: string
    targetMinutes: number
    actual: string
    actualMinutes: number
    remainingFormatted: string
    currentMilestone: {
      id: string
      title: string
      description: string | null
    } | null
    nextMilestone: {
      id: string
      title: string
      description: string | null
    } | null
  } | null
  activeGoals: Array<{
    id: string
    period: string
    targetMinutes: number
    targetFormatted: string
    actualMinutes: number
    actualFormatted: string
    remainingMinutes: number
    remainingFormatted: string
    percentage: number
    status: 'completed' | 'in_progress' | 'not_started'
  }>
  thisWeek: {
    target: number
    targetFormatted: string
    actual: number
    actualFormatted: string
    hasWeeklyGoal: boolean
    dailyBreakdown: Array<{
      date: string
      minutes: number
    }>
  }
  skills: Array<{
    skillId: string
    skillName: string
    totalMinutes: number
    percentage: number
  }>
  monthlyProgress: Array<{
    month: string
    totalMinutes: number
  }>
  yearlyProgress: Array<{
    month: string
    totalMinutes: number
  }>
  recentActivity: Array<{
    id: string
    skill: string
    category: string | null
    topic: string | null
    notes: string | null
    duration: number
    durationFormatted: string
    startedAt: string
    endedAt: string
  }>
}

export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: () => apiClient.get<DashboardData>('/api/v1/dashboard'),
    staleTime: 30000, // 30 seconds — refetch after 30s of staleness
    refetchOnWindowFocus: true,
  })
}
