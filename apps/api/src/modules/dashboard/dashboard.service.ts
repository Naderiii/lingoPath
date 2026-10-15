import type { PrismaClient } from '@prisma/client'
import { computeRemainingDays, formatMinutes } from '../plans/plan.service.js'
import { createPrismaStreakReader } from '../calendar/calendar.service.js'
import { dayBoundsUtc, getDayKey } from '../../shared/timezone.js'

interface DashboardRepository {
  getTodayStats(userId: string, timezone: string): Promise<{
    todayTotalMinutes: number
    dailyTargetMinutes: number
    remainingMinutes: number
    hasDailyGoal: boolean
    streak: number
    sessions: Array<{
      id: string
      skillId: string
      startedAt: Date
      endedAt: Date
      durationMinutes: number
      topic: string | null
      skill: { id: string; name: string }
      category: { id: string; name: string } | null
    }>
  }>
  getActivePlan(userId: string, timezone: string): Promise<{
    plan: {
      id: string
      title: string
      description: string | null
      startDate: Date
      endDate: Date
      targetMinutes: number
      status: string
      objective: { id: string; title: string; type: string } | null
      milestones: Array<{
        id: string
        title: string
        description: string | null
        startDate: Date
        endDate: Date
        targetMinutes: number
        status: string
        ordering: number
        skill: { id: string; name: string } | null
      }>
    }
    progress: {
      actualMinutes: number
      remainingMinutes: number
      studyProgressPercent: number
      remainingDays: number
      elapsedDays: number
      totalDays: number
    }
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
  } | null>
  getActiveGoals(userId: string, timezone: string): Promise<
    Array<{
      id: string
      period: string
      targetMinutes: number
      actualMinutes: number
      remainingMinutes: number
      percentage: number
      status: 'completed' | 'in_progress' | 'not_started'
    }>
  >
  getWeekStats(userId: string, timezone: string): Promise<{
    weekStart: string
    weekEnd: string
    targetMinutes: number
    actualMinutes: number
    hasWeeklyGoal: boolean
    dailyBreakdown: Array<{
      date: string
      minutes: number
    }>
  }>
  getSkillDistribution(userId: string): Promise<
    Array<{
      skillId: string
      skillName: string
      totalMinutes: number
      percentage: number
    }>
  >
  getMonthlyProgress(userId: string): Promise<
    Array<{
      month: string
      totalMinutes: number
    }>
  >
  getYearlyProgress(userId: string): Promise<
    Array<{
      month: string
      totalMinutes: number
    }>
  >
  getRecentSessions(
    userId: string,
    limit: number,
  ): Promise<
    Array<{
      id: string
      skillId: string
      startedAt: Date
      endedAt: Date
      durationMinutes: number
      topic: string | null
      notes: string | null
      skill: { id: string; name: string }
      category: { id: string; name: string } | null
    }>
  >
}

export function createDashboardRepository(prisma: PrismaClient): DashboardRepository {
  // Streaks are never computed here: the calendar module owns that rule and this
  // reader is the only entry point to it (Phase 7).
  const readStreak = createPrismaStreakReader(prisma)

  return {
    async getTodayStats(userId: string, timezone: string) {
      const now = new Date()
      // Half-open UTC window for "today in the user's timezone".
      const { start, end } = dayBoundsUtc(getDayKey(now, timezone), timezone)

      const [todaySessions, dailyGoal, streak] = await Promise.all([
        prisma.studySession.findMany({
          where: {
            userId,
            startedAt: { gte: start, lt: end },
          },
          include: { skill: true, category: true },
          orderBy: { startedAt: 'desc' },
        }),
        prisma.goal.findFirst({
          where: {
            userId,
            period: 'DAILY',
            isActive: true,
            startDate: { lte: now },
            OR: [{ endDate: null }, { endDate: { gte: now } }],
          },
          orderBy: { startDate: 'desc' },
        }),
        readStreak(userId, timezone),
      ])

      const totalMinutes = todaySessions.reduce((sum, s) => sum + s.durationMinutes, 0)
      const dailyTargetMinutes = dailyGoal?.targetMinutes ?? 60
      const remainingMinutes = Math.max(0, dailyTargetMinutes - totalMinutes)

      return {
        todayTotalMinutes: totalMinutes,
        dailyTargetMinutes,
        remainingMinutes,
        hasDailyGoal: dailyGoal !== null,
        streak: streak.currentStreak,
        sessions: todaySessions,
      }
    },

    async getActivePlan(userId: string, timezone: string) {
      const now = new Date()
      const plan = await prisma.longTermPlan.findFirst({
        where: {
          userId,
          status: 'ACTIVE',
          startDate: { lte: now },
          endDate: { gte: now },
        },
        include: {
          objective: true,
          milestones: {
            where: { status: { not: 'CANCELLED' } },
            orderBy: { ordering: 'asc' },
            include: { skill: true },
          },
        },
        orderBy: { startDate: 'desc' },
      })

      if (!plan) return null

      // Aggregate actual study minutes for this plan (source of truth: StudySession)
      const result = await prisma.studySession.aggregate({
        where: {
          OR: [{ planId: plan.id }, { milestone: { planId: plan.id } }],
        },
        _sum: { durationMinutes: true },
      })
      const actualMinutes = result._sum.durationMinutes ?? 0

      const remainingMinutes = Math.max(0, plan.targetMinutes - actualMinutes)
      const studyProgressPercent =
        plan.targetMinutes > 0
          ? Math.min(100, Math.round((actualMinutes / plan.targetMinutes) * 10000) / 100)
          : 0
      const remainingDays = computeRemainingDays(plan.endDate, now, timezone)

      // Elapsed days
      const totalMs = plan.endDate.getTime() - plan.startDate.getTime()
      const elapsedMs = Math.max(0, now.getTime() - plan.startDate.getTime())
      const totalDays = Math.max(1, Math.round(totalMs / (1000 * 60 * 60 * 24)))
      const elapsedDays = Math.min(totalDays, Math.round(elapsedMs / (1000 * 60 * 60 * 24)))

      // Find current milestone (date-range based)
      let currentMilestone = null
      let nextMilestone = null

      for (const m of plan.milestones) {
        if (m.status === 'ACTIVE' && now >= m.startDate && now <= m.endDate) {
          currentMilestone = { id: m.id, title: m.title, description: m.description }
          break
        }
      }

      for (const m of plan.milestones) {
        if (m.status === 'ACTIVE' && now < m.startDate) {
          nextMilestone = { id: m.id, title: m.title, description: m.description }
          break
        }
      }

      return {
        plan,
        progress: {
          actualMinutes,
          remainingMinutes,
          studyProgressPercent,
          remainingDays,
          elapsedDays,
          totalDays,
        },
        currentMilestone,
        nextMilestone,
      }
    },

    async getActiveGoals(userId: string, timezone: string) {
      const now = new Date()
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
      const todayStr = formatter.format(now)

      // Active goals for relevant periods (DAILY, WEEKLY, MONTHLY)
      const goals = await prisma.goal.findMany({
        where: {
          userId,
          isActive: true,
          period: { in: ['DAILY', 'WEEKLY', 'MONTHLY'] },
          startDate: { lte: now },
          OR: [{ endDate: null }, { endDate: { gte: now } }],
        },
        orderBy: [{ period: 'asc' }, { startDate: 'desc' }],
      })

      // No active goals
      if (goals.length === 0) return []

      // For each period, keep only the most recent active goal
      const latestByPeriod = new Map<string, typeof goals[0]>()
      for (const g of goals) {
        if (!latestByPeriod.has(g.period)) {
          latestByPeriod.set(g.period, g)
        }
      }

      const result = []

      for (const goal of latestByPeriod.values()) {
        // Calculate actual minutes within current period window
        let periodStart: Date
        let periodEnd: Date = now

        if (goal.period === 'DAILY') {
          const todayStart = new Date(`${todayStr}T00:00:00`)
          const offsetMs = todayStart.getTime() - new Date(`${todayStr}T00:00:00Z`).getTime()
          periodStart = new Date(todayStart.getTime() - offsetMs)
          periodEnd = new Date(new Date(`${todayStr}T23:59:59.999`).getTime() - offsetMs)
        } else if (goal.period === 'WEEKLY') {
          const today = new Date(`${todayStr}T00:00:00Z`)
          const dayOfWeek = today.getUTCDay()
          const diff = today.getUTCDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1)
          periodStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), diff))
          periodEnd = new Date(periodStart.getTime() + 7 * 86400000 - 1)
        } else {
          // MONTHLY
          periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
          periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999))
        }

        const agg = await prisma.studySession.aggregate({
          where: {
            userId,
            startedAt: { gte: periodStart, lte: periodEnd },
          },
          _sum: { durationMinutes: true },
        })

        const actualMinutes = agg._sum.durationMinutes ?? 0
        const targetMinutes = goal.targetMinutes
        const remainingMinutes = Math.max(0, targetMinutes - actualMinutes)
        const percentage =
          targetMinutes > 0 ? Math.min(100, Math.round((actualMinutes / targetMinutes) * 100)) : 0
        const status =
          actualMinutes >= targetMinutes
            ? 'completed'
            : actualMinutes > 0
              ? 'in_progress'
              : 'not_started'

        result.push({
          id: goal.id,
          period: goal.period,
          targetMinutes,
          actualMinutes,
          remainingMinutes,
          percentage,
          status: status as 'completed' | 'in_progress' | 'not_started',
        })
      }

      return result
    },

    async getWeekStats(userId: string, timezone: string) {
      const now = new Date()
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })

      const todayStr = formatter.format(now)
      const today = new Date(`${todayStr}T00:00:00Z`)
      const dayOfWeek = today.getUTCDay()
      const diff = today.getUTCDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1)
      const monday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), diff))
      const sunday = new Date(monday.getTime() + 7 * 86400000 - 1)

      const weekStart = monday.toISOString().split('T')[0]!
      const weekEnd = new Date(monday.getTime() + 6 * 86400000).toISOString().split('T')[0]!

      // Get active weekly goal
      const weeklyGoal = await prisma.goal.findFirst({
        where: {
          userId,
          period: 'WEEKLY',
          isActive: true,
          startDate: { lte: sunday },
          OR: [{ endDate: null }, { endDate: { gte: monday } }],
        },
        orderBy: { startDate: 'desc' },
      })

      const targetMinutes = weeklyGoal?.targetMinutes ?? 420 // 7h default

      // Sessions for the week
      const sessions = await prisma.studySession.findMany({
        where: {
          userId,
          startedAt: { gte: monday, lte: sunday },
        },
        select: { startedAt: true, durationMinutes: true },
      })

      const actualMinutes = sessions.reduce((sum, s) => sum + s.durationMinutes, 0)

      // Build daily breakdown map (Mon–Sun)
      const dailyMap = new Map<string, number>()
      for (let i = 0; i < 7; i++) {
        const day = new Date(monday.getTime() + i * 86400000)
        dailyMap.set(day.toISOString().split('T')[0]!, 0)
      }
      for (const s of sessions) {
        const dayStr = s.startedAt.toISOString().split('T')[0]!
        if (dailyMap.has(dayStr)) {
          dailyMap.set(dayStr, (dailyMap.get(dayStr) ?? 0) + s.durationMinutes)
        }
      }

      const dailyBreakdown = Array.from(dailyMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, minutes]) => ({ date, minutes }))

      return {
        weekStart,
        weekEnd,
        targetMinutes,
        actualMinutes,
        hasWeeklyGoal: weeklyGoal !== null,
        dailyBreakdown,
      }
    },

    async getSkillDistribution(userId: string) {
      // Last 30 days
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

      const sessions = await prisma.studySession.findMany({
        where: {
          userId,
          startedAt: { gte: thirtyDaysAgo },
        },
        include: { skill: true },
      })

      const skillMap = new Map<string, { name: string; minutes: number }>()
      let totalMinutes = 0

      for (const s of sessions) {
        totalMinutes += s.durationMinutes
        const existing = skillMap.get(s.skillId) ?? { name: s.skill.name, minutes: 0 }
        skillMap.set(s.skillId, {
          name: s.skill.name,
          minutes: existing.minutes + s.durationMinutes,
        })
      }

      return Array.from(skillMap.entries())
        .map(([skillId, { name, minutes }]) => ({
          skillId,
          skillName: name,
          totalMinutes: minutes,
          percentage: totalMinutes > 0 ? Math.round((minutes / totalMinutes) * 100) : 0,
        }))
        .sort((a, b) => b.totalMinutes - a.totalMinutes)
    },

    async getMonthlyProgress(userId: string) {
      const now = new Date()
      const firstDayOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
      const lastDayOfMonth = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999),
      )

      const sessions = await prisma.studySession.findMany({
        where: {
          userId,
          startedAt: { gte: firstDayOfMonth, lte: lastDayOfMonth },
        },
        select: { startedAt: true, durationMinutes: true },
        orderBy: { startedAt: 'asc' },
      })

      const dayMap = new Map<string, number>()
      for (const s of sessions) {
        const dayStr = s.startedAt.toISOString().split('T')[0]!
        dayMap.set(dayStr, (dayMap.get(dayStr) ?? 0) + s.durationMinutes)
      }

      return Array.from(dayMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, totalMinutes]) => ({ month, totalMinutes }))
    },

    async getYearlyProgress(userId: string) {
      const now = new Date()
      const firstDayOfYear = new Date(Date.UTC(now.getUTCFullYear(), 0, 1))
      const lastDayOfYear = new Date(Date.UTC(now.getUTCFullYear(), 11, 31, 23, 59, 59, 999))

      const sessions = await prisma.studySession.findMany({
        where: {
          userId,
          startedAt: { gte: firstDayOfYear, lte: lastDayOfYear },
        },
        select: { startedAt: true, durationMinutes: true },
        orderBy: { startedAt: 'asc' },
      })

      const monthMap = new Map<string, number>()
      for (const s of sessions) {
        const d = new Date(s.startedAt)
        const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
        monthMap.set(key, (monthMap.get(key) ?? 0) + s.durationMinutes)
      }

      return Array.from(monthMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, totalMinutes]) => ({ month, totalMinutes }))
    },

    async getRecentSessions(userId: string, limit: number) {
      return prisma.studySession.findMany({
        where: { userId },
        include: { skill: true, category: true },
        orderBy: { startedAt: 'desc' },
        take: limit,
      })
    },
  }
}

export function createDashboardService(repository: DashboardRepository) {
  return {
    async getDashboard(userId: string, timezone: string) {
      const [
        today,
        activePlan,
        activeGoals,
        weekStats,
        skillDistribution,
        monthlyProgress,
        yearlyProgress,
        recentSessions,
      ] = await Promise.all([
        repository.getTodayStats(userId, timezone),
        repository.getActivePlan(userId, timezone),
        repository.getActiveGoals(userId, timezone),
        repository.getWeekStats(userId, timezone),
        repository.getSkillDistribution(userId),
        repository.getMonthlyProgress(userId),
        repository.getYearlyProgress(userId),
        repository.getRecentSessions(userId, 10),
      ])

      return {
        today: {
          studyTime: today.todayTotalMinutes,
          studyTimeFormatted: formatMinutes(today.todayTotalMinutes),
          dailyTarget: today.dailyTargetMinutes,
          dailyTargetFormatted: formatMinutes(today.dailyTargetMinutes),
          remainingTarget: today.remainingMinutes,
          remainingTargetFormatted: formatMinutes(today.remainingMinutes),
          hasDailyGoal: today.hasDailyGoal,
          sessions: today.sessions.length,
          currentStreak: today.streak,
        },
        activePlan: activePlan
          ? {
              id: activePlan.plan.id,
              name: activePlan.plan.title,
              objective: activePlan.plan.objective?.title ?? null,
              startDate: activePlan.plan.startDate.toISOString(),
              endDate: activePlan.plan.endDate.toISOString(),
              remainingDays: activePlan.progress.remainingDays,
              elapsedDays: activePlan.progress.elapsedDays,
              totalDays: activePlan.progress.totalDays,
              studyProgress: activePlan.progress.studyProgressPercent,
              target: formatMinutes(activePlan.plan.targetMinutes),
              targetMinutes: activePlan.plan.targetMinutes,
              actual: formatMinutes(activePlan.progress.actualMinutes),
              actualMinutes: activePlan.progress.actualMinutes,
              remainingFormatted: formatMinutes(activePlan.progress.remainingMinutes),
              currentMilestone: activePlan.currentMilestone,
              nextMilestone: activePlan.nextMilestone,
            }
          : null,
        activeGoals: activeGoals.map((g) => ({
          id: g.id,
          period: g.period,
          targetMinutes: g.targetMinutes,
          targetFormatted: formatMinutes(g.targetMinutes),
          actualMinutes: g.actualMinutes,
          actualFormatted: formatMinutes(g.actualMinutes),
          remainingMinutes: g.remainingMinutes,
          remainingFormatted: formatMinutes(g.remainingMinutes),
          percentage: g.percentage,
          status: g.status,
        })),
        thisWeek: {
          target: weekStats.targetMinutes,
          targetFormatted: formatMinutes(weekStats.targetMinutes),
          actual: weekStats.actualMinutes,
          actualFormatted: formatMinutes(weekStats.actualMinutes),
          hasWeeklyGoal: weekStats.hasWeeklyGoal,
          dailyBreakdown: weekStats.dailyBreakdown,
        },
        skills: skillDistribution,
        monthlyProgress,
        yearlyProgress,
        recentActivity: recentSessions.map((s) => ({
          id: s.id,
          skill: s.skill.name,
          category: s.category?.name ?? null,
          topic: s.topic,
          notes: s.notes,
          duration: s.durationMinutes,
          durationFormatted: formatMinutes(s.durationMinutes),
          startedAt: s.startedAt.toISOString(),
          endedAt: s.endedAt.toISOString(),
        })),
      }
    },
  }
}

export type DashboardService = ReturnType<typeof createDashboardService>
