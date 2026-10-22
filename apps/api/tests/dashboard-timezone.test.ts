import { describe, it, expect } from 'vitest'
import Fastify from 'fastify'
import type { PrismaClient } from '@prisma/client'
import {
  createDashboardRepository,
  createDashboardService,
} from '../src/modules/dashboard/dashboard.service.js'
import { createGoalRepository } from '../src/modules/goals/goal.repository.js'
import errorHandlerPlugin from '../src/plugins/error-handler.js'
import dashboardRoutes from '../src/modules/dashboard/dashboard.routes.js'
import { DEFAULT_USER_ID } from '../src/shared/current-user.js'
import {
  addDaysToDayKey,
  dayBoundsUtc,
  getDayKey,
  getWeekdayIndex,
} from '../src/shared/timezone.js'

/**
 * Regression tests for two confirmed audit defects:
 *
 * 1. `dashboard.routes.ts` carried a placeholder user id instead of the seeded
 *    UUID, so `/api/v1/dashboard` resolved a non-existent user and every metric
 *    came back zero — the web client never sends `x-user-id` to mask it.
 * 2. Dashboard windows (week / month / year / skill distribution / goal periods)
 *    were derived from UTC or server-local arithmetic, so the same sessions
 *    produced different totals than the calendar, streak and goals modules.
 */

interface Row {
  id: string
  userId: string
  startedAt: Date
  durationMinutes: number
  skillId: string
  skillName: string
}

function row(
  id: string,
  startedAt: string,
  durationMinutes: number,
  skillId = 'skill-1',
  skillName = 'Grammar',
): Row {
  return {
    id,
    userId: DEFAULT_USER_ID,
    startedAt: new Date(startedAt),
    durationMinutes,
    skillId,
    skillName,
  }
}

interface FakeOptions {
  rows?: Row[]
  timezone?: string | null
  goals?: Array<Record<string, unknown>>
}

/**
 * An instant inside the current UTC day.
 *
 * The identity test asserts today's total, so a hard-coded date made the suite
 * pass only on the day it was written (it failed from 2026-10-17 onward).
 */
function todayAtUtcNoon(): string {
  return `${getDayKey(new Date(), 'UTC')}T12:00:00Z`
}

/** Minimal in-memory Prisma stand-in that honours the timestamp windows. */
function fakePrisma(options: FakeOptions = {}) {
  const rows = options.rows ?? []
  const captures: Array<{ model: string; method: string; args: Record<string, unknown> }> = []
  const filtered = (where: Record<string, unknown> | undefined) => {
    if (!where) return rows
    const range = where['startedAt'] as { gte?: Date; lt?: Date; lte?: Date } | undefined
    return rows.filter((entry) => {
      if (where['userId'] && entry.userId !== where['userId']) return false
      if (range?.gte && entry.startedAt < range.gte) return false
      if (range?.lt && entry.startedAt >= range.lt) return false
      if (range?.lte && entry.startedAt > range.lte) return false
      return true
    })
  }

  const prisma = {
    user: {
      findUnique: async () =>
        options.timezone === null ? null : { timezone: options.timezone ?? 'UTC' },
    },
    studySession: {
      findMany: async (args: Record<string, unknown>) => {
        captures.push({ model: 'studySession', method: 'findMany', args })
        return filtered(args['where'] as Record<string, unknown>).map((entry) => ({
          ...entry,
          endedAt: new Date(entry.startedAt.getTime() + entry.durationMinutes * 60_000),
          createdAt: entry.startedAt,
          updatedAt: entry.startedAt,
          categoryId: null,
          topic: null,
          description: null,
          notes: null,
          selfRating: null,
          isManual: true,
          planId: null,
          milestoneId: null,
          skill: { id: entry.skillId, name: entry.skillName },
          category: null,
        }))
      },
      findFirst: async (args: Record<string, unknown>) => {
        captures.push({ model: 'studySession', method: 'findFirst', args })
        return filtered(args['where'] as Record<string, unknown>)[0] ?? null
      },
      aggregate: async (args: Record<string, unknown>) => {
        captures.push({ model: 'studySession', method: 'aggregate', args })
        const matched = filtered(args['where'] as Record<string, unknown>)
        return { _sum: { durationMinutes: matched.reduce((sum, r) => sum + r.durationMinutes, 0) } }
      },
    },
    goal: {
      findFirst: async (args: Record<string, unknown>) => {
        captures.push({ model: 'goal', method: 'findFirst', args })
        return options.goals?.[0] ?? null
      },
      findMany: async (args: Record<string, unknown>) => {
        captures.push({ model: 'goal', method: 'findMany', args })
        return options.goals ?? []
      },
    },
    longTermPlan: { findFirst: async () => null },
    // The streak reader reads the per-user calendar settings (Phase 7).
    calendarSetting: { findUnique: async () => null },
  } as unknown as PrismaClient

  return { prisma, captures }
}

describe('dashboard identity', () => {
  it('queries the seeded default user when no header is sent', async () => {
    const { prisma, captures } = fakePrisma({ rows: [row('s1', todayAtUtcNoon(), 30)] })
    const app = Fastify({ logger: false })
    await app.register(errorHandlerPlugin)
    app.decorate('prisma', prisma)
    await app.register(dashboardRoutes, { prefix: '/api/v1/dashboard' })
    await app.ready()

    const response = await app.inject({ method: 'GET', url: '/api/v1/dashboard' })

    expect(response.statusCode).toBe(200)
    const sessionCalls = captures.filter((entry) => entry.model === 'studySession')
    expect(sessionCalls.length).toBeGreaterThan(0)
    for (const call of sessionCalls) {
      expect((call.args['where'] as Record<string, unknown>)['userId']).toBe(DEFAULT_USER_ID)
    }
    expect(response.json().today.studyTime).toBe(30)

    await app.close()
  })

  it('still honours the x-user-id override', async () => {
    const otherUser = '00000000-0000-0000-0000-000000000002'
    const { prisma, captures } = fakePrisma({})
    const app = Fastify({ logger: false })
    await app.register(errorHandlerPlugin)
    app.decorate('prisma', prisma)
    await app.register(dashboardRoutes, { prefix: '/api/v1/dashboard' })
    await app.ready()

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboard',
      headers: { 'x-user-id': otherUser },
    })

    expect(response.statusCode).toBe(200)
    const sessionCalls = captures.filter((entry) => entry.model === 'studySession')
    expect((sessionCalls[0]!.args['where'] as Record<string, unknown>)['userId']).toBe(otherUser)

    await app.close()
  })

  it('falls back to UTC instead of failing when the stored timezone is unusable', async () => {
    const { prisma } = fakePrisma({ timezone: 'Mars/Olympus' })
    const app = Fastify({ logger: false })
    await app.register(errorHandlerPlugin)
    app.decorate('prisma', prisma)
    await app.register(dashboardRoutes, { prefix: '/api/v1/dashboard' })
    await app.ready()

    const response = await app.inject({ method: 'GET', url: '/api/v1/dashboard' })

    expect(response.statusCode).toBe(200)

    await app.close()
  })
})

describe('dashboard windows follow the user timezone', () => {
  const NY = 'America/New_York'

  function repositoryWith(rows: Row[], timezone: string) {
    const { prisma, captures } = fakePrisma({ rows, timezone })
    return { repository: createDashboardRepository(prisma), captures }
  }

  it('measures the week from the local Monday to the next local Monday', async () => {
    const { repository, captures } = repositoryWith([row('s1', '2026-10-16T10:00:00Z', 30)], NY)

    await repository.getWeekStats(DEFAULT_USER_ID, NY)

    const sessionsCall = captures.find((entry) => entry.model === 'studySession')!
    const where = sessionsCall.args['where'] as { startedAt: { gte: Date; lt: Date } }
    const todayKey = getDayKey(new Date(), NY)
    const mondayKey = addDaysToDayKey(todayKey, -((getWeekdayIndex(todayKey) + 6) % 7))

    expect(where.startedAt.gte.toISOString()).toBe(dayBoundsUtc(mondayKey, NY).start.toISOString())
    expect(where.startedAt.lt.toISOString()).toBe(
      dayBoundsUtc(addDaysToDayKey(mondayKey, 7), NY).start.toISOString(),
    )
  })

  it('measures the current local month with a half-open range', async () => {
    const { repository, captures } = repositoryWith([row('s1', '2026-10-16T10:00:00Z', 30)], NY)

    await repository.getMonthlyProgress(DEFAULT_USER_ID, NY)

    const sessionsCall = captures.find((entry) => entry.model === 'studySession')!
    const where = sessionsCall.args['where'] as { startedAt: { gte: Date; lt: Date } }
    const todayKey = getDayKey(new Date(), NY)
    const [year, month] = todayKey.split('-').map(Number)
    const monthStartKey = `${todayKey.slice(0, 7)}-01`
    // Next month's first day, derived independently of the implementation.
    const nextMonth = new Date(Date.UTC(year!, month!, 1))
    const nextMonthKey = `${nextMonth.getUTCFullYear()}-${String(nextMonth.getUTCMonth() + 1).padStart(2, '0')}-01`

    expect(where.startedAt.gte.toISOString()).toBe(
      dayBoundsUtc(monthStartKey, NY).start.toISOString(),
    )
    // Inclusive end of the month, expressed as the exclusive instant.
    expect(where.startedAt.lt.toISOString()).toBe(
      dayBoundsUtc(nextMonthKey, NY).start.toISOString(),
    )
  })

  it('buckets yearly totals by the user’s local month', async () => {
    const year = Number(getDayKey(new Date(), NY).slice(0, 4))
    // 1 Nov 03:30Z is 31 Oct 23:30 in New York: October, not November. Derived
    // from the current year so the assertion does not stop holding in January.
    const { repository } = repositoryWith([row('s1', `${year}-11-01T03:30:00Z`, 45)], NY)

    const yearly = await repository.getYearlyProgress(DEFAULT_USER_ID, NY)

    expect(yearly).toEqual([{ month: `${year}-10`, totalMinutes: 45 }])
  })

  it('bounds the 30-day skill window at the end of today', async () => {
    const { repository, captures } = repositoryWith([row('s1', '2026-10-16T10:00:00Z', 30)], NY)

    await repository.getSkillDistribution(DEFAULT_USER_ID, NY)

    const sessionsCall = captures.find((entry) => entry.model === 'studySession')!
    const where = sessionsCall.args['where'] as { startedAt: { gte: Date; lt: Date } }
    const todayKey = getDayKey(new Date(), NY)

    expect(where.startedAt.gte.toISOString()).toBe(
      dayBoundsUtc(addDaysToDayKey(todayKey, -29), NY).start.toISOString(),
    )
    expect(where.startedAt.lt.toISOString()).toBe(
      dayBoundsUtc(addDaysToDayKey(todayKey, 1), NY).start.toISOString(),
    )
  })

  it('agrees with the goals module on a DAILY goal’s actual minutes', async () => {
    const goal = {
      id: 'goal-1',
      userId: DEFAULT_USER_ID,
      period: 'DAILY' as const,
      targetMinutes: 60,
      startDate: new Date('2026-01-01T00:00:00Z'),
      endDate: null,
      isActive: true,
      planId: null,
      objectiveId: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      skillTargets: [],
    }

    // Two sessions on "today" in the user's timezone, one of them yesterday.
    const todayKey = getDayKey(new Date(), NY)
    const todayStart = dayBoundsUtc(todayKey, NY).start
    const rows = [
      row('s1', new Date(todayStart.getTime() + 3_600_000).toISOString(), 40),
      row('s2', new Date(todayStart.getTime() - 3_600_000).toISOString(), 25),
    ]

    const { prisma } = fakePrisma({ rows, timezone: NY, goals: [goal] })
    const dashboard = createDashboardRepository(prisma)
    const goals = createGoalRepository(prisma)

    const [activeGoals, progress] = await Promise.all([
      dashboard.getActiveGoals(DEFAULT_USER_ID, NY),
      goals.calculateProgress(goal.id, DEFAULT_USER_ID, NY),
    ])

    const dashboardGoal = activeGoals.find((entry) => entry.id === goal.id)!
    expect(dashboardGoal.actualMinutes).toBe(40)
    expect(progress?.actualMinutes).toBe(40)
    expect(dashboardGoal.percentage).toBe(progress?.percentage)
    expect(dashboardGoal.status).toBe(progress?.status)
  })
})

describe('dashboard service shape', () => {
  it('reports the daily goal window and streak through the canonical reader', async () => {
    const { prisma } = fakePrisma({ rows: [], timezone: 'UTC' })
    const service = createDashboardService(createDashboardRepository(prisma))

    const payload = await service.getDashboard(DEFAULT_USER_ID, 'UTC')

    expect(payload.today.studyTime).toBe(0)
    expect(payload.today.currentStreak).toBe(0)
    expect(payload.thisWeek.dailyBreakdown).toHaveLength(7)
    expect(payload.activePlan).toBeNull()
  })
})
