import { describe, it, expect } from 'vitest'
import { createDashboardService } from '../src/modules/dashboard/dashboard.service.js'

describe('Dashboard Service unit tests', () => {
  it('should correctly format dashboard response', async () => {
    const mockRepo = {
      getTodayStats: async () => ({
        todayTotalMinutes: 90,
        dailyTargetMinutes: 60,
        remainingMinutes: 0,
        hasDailyGoal: true,
        streak: 5,
        sessions: [
          {
            id: 's1',
            skillId: 'sk1',
            startedAt: new Date(),
            endedAt: new Date(),
            durationMinutes: 90,
            topic: 'Grammar practice',
            skill: { id: 'sk1', name: 'Grammar' },
            category: { id: 'c1', name: 'General English' },
          },
        ],
      }),
      getActivePlan: async () => null,
      getActiveGoals: async () => [
        {
          id: 'g1',
          period: 'DAILY',
          targetMinutes: 60,
          actualMinutes: 90,
          remainingMinutes: 0,
          percentage: 100,
          status: 'completed' as const,
        },
      ],
      getWeekStats: async () => ({
        weekStart: '2026-10-12',
        weekEnd: '2026-10-18',
        targetMinutes: 420,
        actualMinutes: 250,
        hasWeeklyGoal: true,
        dailyBreakdown: [
          { date: '2026-10-12', minutes: 50 },
          { date: '2026-10-13', minutes: 60 },
          { date: '2026-10-14', minutes: 40 },
          { date: '2026-10-15', minutes: 100 },
          { date: '2026-10-16', minutes: 0 },
          { date: '2026-10-17', minutes: 0 },
          { date: '2026-10-18', minutes: 0 },
        ],
      }),
      getSkillDistribution: async () => [
        { skillId: 'sk1', skillName: 'Grammar', totalMinutes: 90, percentage: 100 },
      ],
      getMonthlyProgress: async () => [{ month: '2026-10-15', totalMinutes: 250 }],
      getYearlyProgress: async () => [{ month: '2026-10', totalMinutes: 250 }],
      getRecentSessions: async () => [
        {
          id: 's1',
          skillId: 'sk1',
          startedAt: new Date(),
          endedAt: new Date(),
          durationMinutes: 90,
          topic: 'Grammar practice',
          notes: 'Great session',
          skill: { id: 'sk1', name: 'Grammar' },
          category: { id: 'c1', name: 'General English' },
        },
      ],
    }

    const service = createDashboardService(mockRepo)
    const res = await service.getDashboard('user-1', 'UTC')
    expect(res.today.studyTime).toBe(90)
    expect(res.today.currentStreak).toBe(5)
    expect(res.activePlan).toBeNull()
    expect(res.activeGoals).toHaveLength(1)
    expect(res.activeGoals[0]?.status).toBe('completed')
    expect(res.skills).toHaveLength(1)
    expect(res.recentActivity).toHaveLength(1)
  })
})
