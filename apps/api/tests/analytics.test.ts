import { describe, it, expect } from 'vitest'
import Fastify from 'fastify'
import type { PrismaClient } from '@prisma/client'
import {
  buildSkillTrend,
  buildTrend,
  compareMetrics,
  foldBuckets,
  percentageOfDaysMeetingTarget,
  requiredDailyMinutes,
  resolveAnalyticsRange,
  resolvePaceStatus,
  trendGranularityFor,
  type DailySkillBucket,
} from '../src/modules/analytics/analytics.domain.js'
import { createAnalyticsService } from '../src/modules/analytics/analytics.service.js'
import type { AnalyticsRepository } from '../src/modules/analytics/analytics.repository.js'
import analyticsRoutes from '../src/modules/analytics/analytics.routes.js'
import errorHandlerPlugin from '../src/plugins/error-handler.js'
import { DEFAULT_USER_ID } from '../src/shared/current-user.js'
import type { StreakSummaryResponse } from '@lingopath/types'

/** Fixed clock: Friday 2026-10-16, 12:00 UTC. */
const NOW = new Date('2026-10-16T12:00:00Z')

const STREAK: StreakSummaryResponse = {
  timezone: 'UTC',
  qualifyingMinutes: 20,
  currentStreak: 3,
  longestStreak: 9,
  currentStreakStart: '2026-10-14',
  currentStreakEnd: '2026-10-16',
  longestStreakStart: '2026-09-01',
  longestStreakEnd: '2026-09-09',
  today: '2026-10-16',
  todayMinutes: 30,
  todayQualified: true,
  todayPending: false,
  lastQualifiedDate: '2026-10-16',
  totalQualifiedDays: 12,
  minutesToQualifyToday: 0,
}

// ─── Domain ──────────────────────────────────────────────────────────────────

describe('resolveAnalyticsRange', () => {
  const todayKey = '2026-10-16'

  it('resolves relative windows and their preceding twin', () => {
    const range = resolveAnalyticsRange({ range: '30d', todayKey })
    expect(range.from).toBe('2026-09-17')
    expect(range.to).toBe('2026-10-16')
    expect(range.previousFrom).toBe('2026-08-18')
    expect(range.previousTo).toBe('2026-09-16')
    expect(range.days).toBe(30)
    expect(range.comparisonBasis).toBe('preceding-window')
  })

  it('resolves 7 and 90 day windows', () => {
    expect(resolveAnalyticsRange({ range: '7d', todayKey })).toMatchObject({
      from: '2026-10-10',
      to: '2026-10-16',
      previousFrom: '2026-10-03',
      previousTo: '2026-10-09',
      days: 7,
    })
    const ninety = resolveAnalyticsRange({ range: '90d', todayKey })
    expect(ninety.days).toBe(90)
    expect(ninety.from).toBe('2026-07-19')
  })

  it('compares the current year with the same span last year', () => {
    const range = resolveAnalyticsRange({ range: 'current-year', todayKey })
    expect(range.from).toBe('2026-01-01')
    expect(range.to).toBe('2026-10-16')
    expect(range.previousFrom).toBe('2025-01-01')
    expect(range.previousTo).toBe('2025-10-16')
    expect(range.comparisonBasis).toBe('same-period-last-year')
  })

  it('resolves the previous year and the year before it', () => {
    const range = resolveAnalyticsRange({ range: 'previous-year', todayKey })
    expect(range.from).toBe('2025-01-01')
    expect(range.to).toBe('2025-12-31')
    expect(range.previousFrom).toBe('2024-01-01')
    expect(range.previousTo).toBe('2024-12-31')
    expect(range.days).toBe(365)
  })

  it('clamps a leap-day anchor when shifting a year', () => {
    const range = resolveAnalyticsRange({ range: 'current-year', todayKey: '2024-02-29' })
    expect(range.previousTo).toBe('2023-02-28')
  })

  it('resolves a custom range against the equal window before it', () => {
    const range = resolveAnalyticsRange({
      range: 'custom',
      from: '2026-03-01',
      to: '2026-03-10',
      todayKey,
    })
    expect(range).toMatchObject({
      from: '2026-03-01',
      to: '2026-03-10',
      previousFrom: '2026-02-19',
      previousTo: '2026-02-28',
      days: 10,
    })
  })
})

describe('foldBuckets', () => {
  const buckets: DailySkillBucket[] = [
    { day: '2026-10-14', skillId: 'grammar', minutes: 45, sessions: 2 },
    { day: '2026-10-14', skillId: 'listening', minutes: 15, sessions: 1 },
    { day: '2026-10-16', skillId: 'grammar', minutes: 30, sessions: 1 },
  ]

  it('builds a zero-filled daily series with explicit inactive days', () => {
    const folded = foldBuckets(buckets, { from: '2026-10-13', to: '2026-10-16' })

    expect(folded.days).toEqual([
      { date: '2026-10-13', minutes: 0, sessions: 0 },
      { date: '2026-10-14', minutes: 60, sessions: 3 },
      { date: '2026-10-15', minutes: 0, sessions: 0 },
      { date: '2026-10-16', minutes: 30, sessions: 1 },
    ])
    expect(folded.totalMinutes).toBe(90)
    expect(folded.totalSessions).toBe(4)
    expect(folded.activeDays).toBe(2)
    expect(folded.inactiveDays).toBe(2)
  })

  it('totals skills across days, ordered by minutes', () => {
    const folded = foldBuckets(buckets, { from: '2026-10-13', to: '2026-10-16' })

    expect(folded.skills).toEqual([
      { skillId: 'grammar', minutes: 75, sessions: 3 },
      { skillId: 'listening', minutes: 15, sessions: 1 },
    ])
  })

  it('ignores buckets outside the window', () => {
    const folded = foldBuckets(
      [...buckets, { day: '2026-01-01', skillId: 'grammar', minutes: 999, sessions: 9 }],
      { from: '2026-10-13', to: '2026-10-16' },
    )

    expect(folded.totalMinutes).toBe(90)
  })

  it('handles an empty dataset', () => {
    const folded = foldBuckets([], { from: '2026-10-15', to: '2026-10-16' })

    expect(folded.totalMinutes).toBe(0)
    expect(folded.activeDays).toBe(0)
    expect(folded.inactiveDays).toBe(2)
    expect(folded.skills).toEqual([])
  })

  it('crosses month and year boundaries when zero-filling', () => {
    const folded = foldBuckets(
      [{ day: '2026-01-01', skillId: 'grammar', minutes: 10, sessions: 1 }],
      { from: '2025-12-30', to: '2026-01-02' },
    )

    expect(folded.days.map((day) => day.date)).toEqual([
      '2025-12-30',
      '2025-12-31',
      '2026-01-01',
      '2026-01-02',
    ])
  })
})

describe('trends and goal coverage', () => {
  const days = [
    { date: '2026-10-12', minutes: 30, sessions: 1 },
    { date: '2026-10-13', minutes: 0, sessions: 0 },
    { date: '2026-10-14', minutes: 60, sessions: 2 },
    { date: '2026-10-15', minutes: 0, sessions: 0 },
    { date: '2026-10-16', minutes: 30, sessions: 1 },
  ]

  it('uses daily buckets for short windows', () => {
    expect(trendGranularityFor(7)).toBe('day')
    expect(trendGranularityFor(90)).toBe('week')
    expect(trendGranularityFor(365)).toBe('month')

    expect(buildTrend(days, 'day')).toHaveLength(5)
  })

  it('groups weeks on Monday and months by calendar month', () => {
    const weekly = buildTrend(days, 'week')
    // 2026-10-12 is a Monday, so every day in the fixture falls in one week.
    expect(weekly).toEqual([{ bucket: '2026-10-12', minutes: 120, sessions: 4 }])

    const monthly = buildTrend(
      [
        { date: '2026-01-31', minutes: 10, sessions: 1 },
        { date: '2026-02-01', minutes: 20, sessions: 1 },
      ],
      'month',
    )
    expect(monthly).toEqual([
      { bucket: '2026-01', minutes: 10, sessions: 1 },
      { bucket: '2026-02', minutes: 20, sessions: 1 },
    ])
  })

  it('counts days meeting the daily target', () => {
    expect(percentageOfDaysMeetingTarget(days, 60)).toEqual({
      daysMeetingTarget: 1,
      percentage: 20,
    })
    expect(percentageOfDaysMeetingTarget(days, 30)).toEqual({
      daysMeetingTarget: 3,
      percentage: 60,
    })
    // A zero target still requires actual study.
    expect(percentageOfDaysMeetingTarget(days, 0)).toEqual({
      daysMeetingTarget: 3,
      percentage: 60,
    })
    expect(percentageOfDaysMeetingTarget([], 30)).toEqual({
      daysMeetingTarget: 0,
      percentage: 0,
    })
  })
})

describe('comparisons handle a zero baseline', () => {
  it('does not produce an infinite percentage', () => {
    const delta = compareMetrics(600, 0)

    expect(delta.changePercent).toBeNull()
    expect(delta.zeroBaseline).toBe(true)
    expect(delta.absolute).toBe(600)
    expect(delta.direction).toBe('up')
  })

  it('reports a real zero-to-zero as flat, not as new', () => {
    const delta = compareMetrics(0, 0)

    expect(delta.changePercent).toBeNull()
    expect(delta.zeroBaseline).toBe(true)
    expect(delta.direction).toBe('flat')
  })

  it('computes ordinary increases and decreases', () => {
    expect(compareMetrics(150, 100)).toMatchObject({ changePercent: 50, direction: 'up' })
    expect(compareMetrics(50, 100)).toMatchObject({ changePercent: -50, direction: 'down' })
  })

  it('marks a skill that had no previous activity', () => {
    expect(buildSkillTrend(120, 0)).toMatchObject({ changePercent: null, zeroBaseline: true })
    expect(buildSkillTrend(120, 60)).toMatchObject({ changePercent: 100, zeroBaseline: false })
  })
})

describe('plan pacing', () => {
  it('labels ahead, on-track and behind', () => {
    expect(
      resolvePaceStatus({ targetMinutes: 1000, actualMinutes: 800, timeProgressPercent: 50 }),
    ).toBe('ahead')
    expect(
      resolvePaceStatus({ targetMinutes: 1000, actualMinutes: 520, timeProgressPercent: 50 }),
    ).toBe('on-track')
    expect(
      resolvePaceStatus({ targetMinutes: 1000, actualMinutes: 200, timeProgressPercent: 50 }),
    ).toBe('behind')
  })

  it('handles zero targets, zero progress and completion', () => {
    expect(resolvePaceStatus({ targetMinutes: 0, actualMinutes: 0, timeProgressPercent: 10 })).toBe(
      'not-started',
    )
    expect(
      resolvePaceStatus({ targetMinutes: 1000, actualMinutes: 0, timeProgressPercent: 50 }),
    ).toBe('not-started')
    expect(
      resolvePaceStatus({ targetMinutes: 1000, actualMinutes: 1000, timeProgressPercent: 50 }),
    ).toBe('completed')
  })

  it('spreads what is left over the days that remain', () => {
    expect(requiredDailyMinutes(1000, 400, 10)).toBe(60)
    expect(requiredDailyMinutes(1000, 1000, 10)).toBe(0)
    expect(requiredDailyMinutes(1000, 400, 0)).toBe(600)
  })
})

// ─── Service ─────────────────────────────────────────────────────────────────

interface FakeOptions {
  buckets?: DailySkillBucket[]
  previousBuckets?: DailySkillBucket[]
  longest?: { id: string; durationMinutes: number; startedAt: Date; skillId: string } | null
  skills?: Array<{ id: string; name: string }>
  dailyGoalTarget?: number | null
  plans?: Array<Record<string, unknown>>
  goals?: Array<Record<string, unknown>>
  goalProgress?: Record<string, unknown> | null
  rawCalls?: Array<{ values: unknown[] }>
}

function createFakeRepository(options: FakeOptions = {}) {
  const rawCalls: Array<{ values: unknown[] }> = options.rawCalls ?? []
  let callIndex = 0
  const bucketsFor = () => {
    // The service loads the current window first, then the previous one.
    const index = callIndex++
    return index % 2 === 0 ? (options.buckets ?? []) : (options.previousBuckets ?? [])
  }

  const repository = {
    async getLongestSession() {
      return options.longest ?? null
    },
    async getDailySkillBuckets(
      _userId: string,
      _from: Date,
      _to: Date,
      timeZone: string,
    ): Promise<DailySkillBucket[]> {
      rawCalls.push({ values: [timeZone] })
      return bucketsFor()
    },
    async getSkillsByIds() {
      return options.skills ?? [{ id: 'grammar', name: 'Grammar' }]
    },
    async getActiveDailyGoalTarget() {
      return options.dailyGoalTarget ?? null
    },
    async listActivePlans() {
      return options.plans ?? []
    },
    async listActiveGoals() {
      return options.goals ?? []
    },
    planRepository: {
      async getActualMinutesForPlan() {
        return 600
      },
      async getActualMinutesByMilestone() {
        return {
          milestones: [{ milestoneId: 'ms-1', totalMinutes: 400 }],
          unassignedMinutes: 200,
        }
      },
      async getWeeklyActualMinutes() {
        return [{ weekStart: '2026-10-12', totalMinutes: 120 }]
      },
      async getMonthlyActualMinutes() {
        return [{ month: '2026-10', totalMinutes: 480 }]
      },
    },
    goalRepository: {
      async calculateProgress() {
        return (
          options.goalProgress ?? {
            targetMinutes: 60,
            actualMinutes: 45,
            remainingMinutes: 15,
            percentage: 75,
            status: 'in_progress',
            skillProgress: [],
          }
        )
      },
    },
  } as unknown as AnalyticsRepository

  return { repository, rawCalls }
}

function serviceWith(options: FakeOptions = {}, timeZone = 'UTC') {
  const { repository, rawCalls } = createFakeRepository(options)
  return {
    service: createAnalyticsService(
      repository,
      { getStreak: async () => STREAK },
      { now: () => NOW },
    ),
    rawCalls,
    timeZone,
  }
}

describe('analytics service', () => {
  const buckets: DailySkillBucket[] = [
    { day: '2026-09-17', skillId: 'grammar', minutes: 40, sessions: 1 },
    { day: '2026-10-14', skillId: 'grammar', minutes: 60, sessions: 2 },
    { day: '2026-10-16', skillId: 'listening', minutes: 20, sessions: 1 },
  ]

  it('summarises the window with the requested metrics', async () => {
    const { service } = serviceWith({
      buckets,
      totals: { totalMinutes: 120, totalSessions: 4 },
      previousTotals: { totalMinutes: 40, totalSessions: 1 },
      longest: {
        id: 'session-9',
        durationMinutes: 60,
        startedAt: new Date('2026-10-14T10:00:00Z'),
        skillId: 'grammar',
      },
      dailyGoalTarget: 30,
    })

    const payload = await service.getAnalytics(DEFAULT_USER_ID, { range: '30d' })

    expect(payload.range.from).toBe('2026-09-17')
    expect(payload.summary).toMatchObject({
      totalMinutes: 120,
      totalMinutesFormatted: '2h',
      totalSessions: 4,
      activeDays: 3,
      inactiveDays: 27,
      daysInRange: 30,
      averageDailyMinutes: 4,
      averageSessionMinutes: 30,
      currentStreak: 3,
      longestStreak: 9,
      dailyTargetMinutes: 30,
      daysMeetingTarget: 2,
      percentageOfDaysMeetingTarget: 7,
    })
    expect(payload.summary.longestSession).toMatchObject({
      id: 'session-9',
      minutes: 60,
      date: '2026-10-14',
    })
  })

  it('falls back to the 60-minute daily target when no DAILY goal exists', async () => {
    const { service } = serviceWith({ buckets, totals: { totalMinutes: 120, totalSessions: 4 } })

    const payload = await service.getAnalytics(DEFAULT_USER_ID, { range: '30d' })

    expect(payload.summary.dailyTargetMinutes).toBe(60)
    expect(payload.summary.daysMeetingTarget).toBe(1)
  })

  it('derives skill analytics with shares, averages and trends', async () => {
    const { service } = serviceWith({
      buckets: [
        { day: '2026-10-14', skillId: 'grammar', minutes: 60, sessions: 2 },
        { day: '2026-10-16', skillId: 'listening', minutes: 20, sessions: 1 },
      ],
      previousBuckets: [{ day: '2026-09-20', skillId: 'grammar', minutes: 40, sessions: 1 }],
      totals: { totalMinutes: 80, totalSessions: 3 },
      skills: [
        { id: 'grammar', name: 'Grammar' },
        { id: 'listening', name: 'Listening' },
      ],
    })

    const payload = await service.getAnalytics(DEFAULT_USER_ID, { range: '30d' })

    expect(payload.skills[0]).toMatchObject({
      skillId: 'grammar',
      name: 'Grammar',
      totalMinutes: 60,
      percentage: 75,
      sessions: 2,
      averageSessionMinutes: 30,
    })
    expect(payload.skills[0]!.trend).toMatchObject({ changePercent: 50, zeroBaseline: false })
    // Listening had no previous activity: "new", not infinity.
    expect(payload.skills[1]!.trend).toMatchObject({ changePercent: null, zeroBaseline: true })
  })

  it('compares the two windows without dividing by zero', async () => {
    const { service } = serviceWith({
      buckets: [
        { day: '2026-10-14', skillId: 'grammar', minutes: 300, sessions: 3 },
        { day: '2026-10-16', skillId: 'grammar', minutes: 300, sessions: 3 },
      ],
      previousBuckets: [],
    })

    const payload = await service.getAnalytics(DEFAULT_USER_ID, { range: '30d' })

    expect(payload.summary.totalMinutes).toBe(600)
    expect(payload.comparison.current.totalMinutes).toBe(600)
    expect(payload.comparison.previous.totalMinutes).toBe(0)
    expect(payload.comparison.deltas.totalMinutes).toMatchObject({
      changePercent: null,
      zeroBaseline: true,
      absolute: 600,
    })
  })

  it('asks the database to bucket in the user timezone', async () => {
    const { service, rawCalls } = serviceWith({ buckets: [] })

    await service.getAnalytics(DEFAULT_USER_ID, { range: '7d', timeZone: 'Asia/Tokyo' })

    expect(rawCalls).toHaveLength(2)
    expect(rawCalls[0]!.values[0]).toBe('Asia/Tokyo')
    expect(rawCalls[1]!.values[0]).toBe('Asia/Tokyo')
  })

  it('rejects unusable requests', async () => {
    const { service } = serviceWith()

    await expect(
      service.getAnalytics(DEFAULT_USER_ID, { range: 'custom', from: '2026-01-01' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
    await expect(
      service.getAnalytics(DEFAULT_USER_ID, {
        range: 'custom',
        from: '2000-01-01',
        to: '2026-01-01',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
    await expect(
      service.getAnalytics(DEFAULT_USER_ID, { range: '30d', timeZone: 'Mars/Olympus' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
  })

  it('reports plan analytics with pacing, milestones and trend series', async () => {
    const plan = {
      id: 'plan-1',
      title: '6-Month IELTS',
      status: 'ACTIVE',
      startDate: new Date('2026-01-01T00:00:00Z'),
      endDate: new Date('2026-07-01T00:00:00Z'),
      targetMinutes: 18000,
      objective: { id: 'obj-1', title: 'IELTS Band 7.5' },
      milestones: [
        {
          id: 'ms-1',
          title: 'Foundations',
          status: 'ACTIVE',
          startDate: new Date('2026-01-01T00:00:00Z'),
          endDate: new Date('2026-02-01T00:00:00Z'),
          targetMinutes: 3000,
          ordering: 0,
        },
      ],
    }

    const { service } = serviceWith({ plans: [plan] })

    const payload = await service.getAnalytics(DEFAULT_USER_ID, { range: '30d' })
    const analytics = payload.plans[0]!

    expect(analytics).toMatchObject({
      planId: 'plan-1',
      title: '6-Month IELTS',
      objectiveTitle: 'IELTS Band 7.5',
      targetMinutes: 18000,
      actualMinutes: 600,
      unassignedMinutes: 200,
      studyProgressPercent: 3.33,
    })
    expect(analytics.milestones[0]).toMatchObject({
      milestoneId: 'ms-1',
      targetMinutes: 3000,
      actualMinutes: 400,
      progressPercent: 13.33,
    })
    expect(analytics.monthly).toEqual([{ month: '2026-10', totalMinutes: 480 }])
    expect(analytics.weekly).toEqual([{ weekStart: '2026-10-12', totalMinutes: 120 }])
    // 600 of 18000 minutes against ~62% of elapsed time.
    expect(analytics.paceStatus).toBe('behind')
    expect(analytics.requiredDailyMinutes).toBeGreaterThan(0)
  })

  it('reuses the goals module for goal progress', async () => {
    const { service } = serviceWith({
      goals: [
        {
          id: 'goal-1',
          period: 'DAILY',
          targetMinutes: 60,
          startDate: NOW,
          endDate: null,
          planId: null,
        },
      ],
    })

    const payload = await service.getAnalytics(DEFAULT_USER_ID, { range: '7d' })

    expect(payload.goals).toEqual([
      {
        id: 'goal-1',
        period: 'DAILY',
        targetMinutes: 60,
        actualMinutes: 45,
        remainingMinutes: 15,
        percentage: 75,
        status: 'in_progress',
      },
    ])
  })

  it('reflects session changes on the next request', async () => {
    const options: FakeOptions = {
      buckets: [{ day: '2026-10-16', skillId: 'grammar', minutes: 30, sessions: 1 }],
      totals: { totalMinutes: 30, totalSessions: 1 },
    }
    const { repository } = createFakeRepository(options)
    const service = createAnalyticsService(
      repository,
      { getStreak: async () => STREAK },
      { now: () => NOW },
    )

    const first = await service.getAnalytics(DEFAULT_USER_ID, { range: '7d' })
    expect(first.summary.totalMinutes).toBe(30)

    // A delete (or edit) changes what the aggregates return — nothing is cached.
    options.buckets = []
    options.totals = { totalMinutes: 0, totalSessions: 0 }

    const second = await service.getAnalytics(DEFAULT_USER_ID, { range: '7d' })
    expect(second.summary.totalMinutes).toBe(0)
    expect(second.summary.activeDays).toBe(0)
  })
})

// ─── HTTP surface ────────────────────────────────────────────────────────────

function createFakePrisma() {
  const prisma = {
    user: { findUnique: async () => ({ timezone: 'UTC' }) },
    studySession: {
      aggregate: async () => ({ _sum: { durationMinutes: 0 }, _count: { _all: 0 } }),
      findFirst: async () => null,
      findMany: async () => [],
    },
    skill: { findMany: async () => [] },
    goal: { findFirst: async () => null, findMany: async () => [] },
    longTermPlan: { findMany: async () => [] },
    planMilestone: { findMany: async () => [] },
    calendarSetting: { findUnique: async () => null },
    $queryRaw: async () => [],
  } as unknown as PrismaClient

  return prisma
}

async function buildTestApp() {
  const app = Fastify({ logger: false })
  await app.register(errorHandlerPlugin)
  app.decorate('prisma', createFakePrisma())
  await app.register(analyticsRoutes, { prefix: '/api/v1' })
  await app.ready()
  return app
}

describe('GET /api/v1/analytics', () => {
  it('returns the consolidated payload', async () => {
    const app = await buildTestApp()

    const response = await app.inject({ method: 'GET', url: '/api/v1/analytics?range=30d' })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.timezone).toBe('UTC')
    expect(body.range.kind).toBe('30d')
    expect(body.summary).toHaveProperty('totalMinutes')
    expect(body.summary).toHaveProperty('percentageOfDaysMeetingTarget')
    expect(body.trends.granularity).toBe('day')
    expect(body.comparison.deltas.totalMinutes).toHaveProperty('zeroBaseline', true)
    expect(Array.isArray(body.skills)).toBe(true)
    expect(Array.isArray(body.plans)).toBe(true)

    await app.close()
  })

  it('accepts a custom range and a timezone override', async () => {
    const app = await buildTestApp()

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/analytics?range=custom&from=2026-01-01&to=2026-03-31&timezone=Europe/Berlin',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      timezone: 'Europe/Berlin',
      range: { kind: 'custom', from: '2026-01-01', to: '2026-03-31' },
    })

    await app.close()
  })

  it('defaults to the last 30 days', async () => {
    const app = await buildTestApp()

    const response = await app.inject({ method: 'GET', url: '/api/v1/analytics' })

    expect(response.statusCode).toBe(200)
    expect(response.json().range.kind).toBe('30d')

    await app.close()
  })

  it('rejects malformed or unsafe queries with 422', async () => {
    const app = await buildTestApp()

    const urls = [
      '/api/v1/analytics?range=custom',
      '/api/v1/analytics?range=custom&from=2026-01-01',
      '/api/v1/analytics?range=custom&from=2026-03-31&to=2026-01-01',
      '/api/v1/analytics?range=custom&from=2026-02-30&to=2026-03-01',
      '/api/v1/analytics?range=custom&from=2000-01-01&to=2026-01-01',
      '/api/v1/analytics?range=30d&from=2026-01-01&to=2026-02-01',
      '/api/v1/analytics?range=forever',
      '/api/v1/analytics?timezone=Mars/Olympus',
    ]

    for (const url of urls) {
      const response = await app.inject({ method: 'GET', url })
      expect(response.statusCode, url).toBe(422)
      expect(response.json().error.code, url).toBe('VALIDATION_ERROR')
    }

    await app.close()
  })
})
