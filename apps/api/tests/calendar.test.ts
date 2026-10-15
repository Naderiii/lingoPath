import { describe, it, expect } from 'vitest'
import Fastify from 'fastify'
import type { PrismaClient } from '@prisma/client'
import type { CalendarRepository } from '../src/modules/calendar/calendar.repository.js'
import { createCalendarService } from '../src/modules/calendar/calendar.service.js'
import errorHandlerPlugin from '../src/plugins/error-handler.js'
import calendarRoutes from '../src/modules/calendar/calendar.routes.js'

/**
 * Calendar module: range resolution, heatmap payload, day drill-down, settings,
 * validation, and the HTTP surface (through `app.inject` with a stubbed Prisma
 * client, so these tests need no database).
 */

interface FixtureSession {
  startedAt: string
  durationMinutes: number
  skillId?: string
  skillName?: string
  categoryId?: string | null
  categoryName?: string | null
  topic?: string | null
  notes?: string | null
  selfRating?: number | null
  planTitle?: string | null
  milestoneTitle?: string | null
}

const FIXTURES: FixtureSession[] = [
  {
    startedAt: '2020-01-15T10:00:00Z',
    durationMinutes: 30,
    skillId: 'skill-grammar',
    skillName: 'Grammar',
    categoryId: 'category-ielts',
    categoryName: 'IELTS',
    topic: 'Articles',
  },
  {
    startedAt: '2020-02-29T10:00:00Z',
    durationMinutes: 60,
    skillId: 'skill-reading',
    skillName: 'Reading',
  },
  {
    startedAt: '2020-12-31T23:00:00Z',
    durationMinutes: 20,
    skillId: 'skill-writing',
    skillName: 'Writing',
  },
  {
    startedAt: '2026-10-14T10:00:00Z',
    durationMinutes: 45,
    skillId: 'skill-grammar',
    skillName: 'Grammar',
    categoryId: 'category-ielts',
    categoryName: 'IELTS',
    topic: 'Articles',
    notes: 'Focused on definite articles',
    selfRating: 4,
  },
  {
    startedAt: '2026-10-14T18:00:00Z',
    durationMinutes: 15,
    skillId: 'skill-listening',
    skillName: 'Listening',
  },
  {
    startedAt: '2026-10-16T09:00:00Z',
    durationMinutes: 25,
    skillId: 'skill-grammar',
    skillName: 'Grammar',
    categoryId: 'category-ielts',
    categoryName: 'IELTS',
    topic: 'Tenses',
    notes: '   ',
  },
  {
    startedAt: '2026-10-20T10:00:00Z',
    durationMinutes: 90,
    skillId: 'skill-writing',
    skillName: 'Writing',
  },
  // 22:00 on 2026-10-15 in New York (EDT)
  {
    startedAt: '2026-10-16T02:00:00Z',
    durationMinutes: 30,
    skillId: 'skill-speaking',
    skillName: 'Speaking',
  },
  // 00:30 on 2026-10-16 in New York (EDT)
  {
    startedAt: '2026-10-16T04:30:00Z',
    durationMinutes: 30,
    skillId: 'skill-speaking',
    skillName: 'Speaking',
  },
]

function toRow(session: FixtureSession, index: number) {
  const startedAt = new Date(session.startedAt)
  return {
    id: `session-${index}`,
    userId: 'user-1',
    skillId: session.skillId ?? 'skill-1',
    categoryId: session.categoryId ?? (session.categoryName ? 'category-1' : null),
    topic: session.topic ?? null,
    description: null,
    startedAt,
    endedAt: new Date(startedAt.getTime() + session.durationMinutes * 60_000),
    durationMinutes: session.durationMinutes,
    selfRating: session.selfRating ?? null,
    notes: session.notes ?? null,
    isManual: true,
    planId: session.planTitle ? 'plan-1' : null,
    milestoneId: session.milestoneTitle ? 'milestone-1' : null,
    createdAt: startedAt,
    updatedAt: startedAt,
    skill: { id: session.skillId ?? 'skill-1', name: session.skillName ?? 'Grammar' },
    category: session.categoryName
      ? { id: session.categoryId ?? 'category-1', name: session.categoryName }
      : null,
    plan: session.planTitle ? { id: 'plan-1', title: session.planTitle } : null,
    milestone: session.milestoneTitle ? { id: 'milestone-1', title: session.milestoneTitle } : null,
  }
}

interface StubOptions {
  sessions?: FixtureSession[]
  timeZone?: string
  settings?: {
    intensityThresholds: number[]
    streakQualifyingMinutes: number
    updatedAt: Date
  } | null
}

function createStubRepository(options: StubOptions = {}) {
  const sessions = (options.sessions ?? FIXTURES).map((session) => ({
    startedAt: new Date(session.startedAt),
    durationMinutes: session.durationMinutes,
  }))
  const rows = (options.sessions ?? FIXTURES)
    .map(toRow)
    .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())
  const state = {
    settings: options.settings ?? null,
    upserts: [] as Array<{ userId: string; data: Record<string, unknown> }>,
  }

  const within = <T extends { startedAt: Date }>(items: T[], from: Date, to: Date): T[] =>
    items.filter((item) => item.startedAt >= from && item.startedAt < to)

  const repository = {
    listActivitySessions: async () => sessions,
    listActivitySessionsBetween: async (_userId: string, from: Date, to: Date) =>
      within(sessions, from, to),
    listSessionsBetween: async (_userId: string, from: Date, to: Date) => within(rows, from, to),
    getUserTimeZone: async () => options.timeZone ?? 'UTC',
    getSettings: async () => state.settings,
    upsertSettings: async (userId: string, data: Record<string, unknown>) => {
      state.upserts.push({ userId, data })
      state.settings = {
        intensityThresholds: (data['intensityThresholds'] as number[] | undefined) ??
          state.settings?.intensityThresholds ?? [20, 40, 60, 90],
        streakQualifyingMinutes:
          (data['streakQualifyingMinutes'] as number | undefined) ??
          state.settings?.streakQualifyingMinutes ??
          20,
        updatedAt: new Date('2026-10-16T12:00:00Z'),
      }
      return state.settings
    },
  } as unknown as CalendarRepository

  return { repository, state }
}

function serviceAt(clockIso: string, options: StubOptions = {}) {
  const { repository, state } = createStubRepository(options)
  return {
    service: createCalendarService(repository, { now: () => new Date(clockIso) }),
    state,
  }
}

describe('calendar ranges', () => {
  it('defaults to the current year in the user’s timezone', async () => {
    const { service } = serviceAt('2026-10-16T12:00:00Z')

    const calendar = await service.getCalendar('user-1')

    expect(calendar.range).toEqual({
      kind: 'CURRENT_YEAR',
      from: '2026-01-01',
      to: '2026-12-31',
      year: 2026,
    })
    expect(calendar.days).toHaveLength(365)
    expect(calendar.days[0]?.date).toBe('2026-01-01')
    expect(calendar.days[364]?.date).toBe('2026-12-31')
  })

  it('exposes the previous year for year-over-year comparison', async () => {
    const { service } = serviceAt('2026-10-16T12:00:00Z')

    const calendar = await service.getCalendar('user-1', { year: 2025 })

    expect(calendar.range).toEqual({
      kind: 'PREVIOUS_YEAR',
      from: '2025-01-01',
      to: '2025-12-31',
      year: 2025,
    })
    expect(calendar.days).toHaveLength(365)
  })

  it('supports arbitrary years and leap years', async () => {
    const { service } = serviceAt('2026-10-16T12:00:00Z')

    const leap = await service.getCalendar('user-1', { year: 2024 })

    expect(leap.range.from).toBe('2024-01-01')
    expect(leap.range.to).toBe('2024-12-31')
    expect(leap.range.kind).toBe('CUSTOM')
    expect(leap.days).toHaveLength(366)
    expect(leap.days.some((day) => day.date === '2024-02-29')).toBe(true)
  })

  it('supports a custom range', async () => {
    const { service } = serviceAt('2026-10-16T12:00:00Z')

    const calendar = await service.getCalendar('user-1', {
      from: '2026-10-12',
      to: '2026-10-18',
    })

    expect(calendar.range).toEqual({
      kind: 'CUSTOM',
      from: '2026-10-12',
      to: '2026-10-18',
      year: null,
    })
    expect(calendar.days.map((day) => day.date)).toEqual([
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
      '2026-10-16',
      '2026-10-17',
      '2026-10-18',
    ])
  })

  it('reports today in the requested timezone', async () => {
    const tokyo = await serviceAt('2026-10-16T23:30:00Z').service.getCalendar('user-1', {
      timeZone: 'Asia/Tokyo',
    })
    expect(tokyo.today).toBe('2026-10-17')
    expect(tokyo.timezone).toBe('Asia/Tokyo')

    const utc = await serviceAt('2026-10-16T23:30:00Z').service.getCalendar('user-1')
    expect(utc.today).toBe('2026-10-16')
  })

  it('rejects unusable requests', async () => {
    const { service } = serviceAt('2026-10-16T12:00:00Z')

    await expect(
      service.getCalendar('user-1', { from: '2026-10-18', to: '2026-10-12' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
    await expect(
      service.getCalendar('user-1', { from: '2026-02-30', to: '2026-03-01' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
    await expect(
      service.getCalendar('user-1', { from: '2000-01-01', to: '2026-12-31' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
    await expect(service.getCalendar('user-1', { timeZone: 'Mars/Olympus' })).rejects.toMatchObject(
      { code: 'VALIDATION_ERROR' },
    )
  })
})

describe('calendar heatmap payload', () => {
  it('aggregates sessions per local day with intensity and streak flags', async () => {
    const { service } = serviceAt('2026-10-16T12:00:00Z')

    const calendar = await service.getCalendar('user-1', {
      from: '2026-10-12',
      to: '2026-10-20',
    })

    const byDate = new Map(calendar.days.map((day) => [day.date, day]))
    expect(byDate.get('2026-10-14')).toMatchObject({
      totalMinutes: 60,
      sessionCount: 2,
      intensity: 3,
      qualified: true,
    })
    expect(byDate.get('2026-10-15')).toMatchObject({
      totalMinutes: 0,
      sessionCount: 0,
      intensity: 0,
    })
    expect(byDate.get('2026-10-16')).toMatchObject({
      totalMinutes: 85,
      sessionCount: 3,
      intensity: 4,
      qualified: true,
    })
    expect(byDate.get('2026-10-20')).toMatchObject({ totalMinutes: 90, intensity: 4 })
  })

  it('splits days by timezone, not by UTC', async () => {
    const utc = await serviceAt('2026-10-16T12:00:00Z').service.getCalendar('user-1', {
      from: '2026-10-14',
      to: '2026-10-16',
    })
    const newYork = await serviceAt('2026-10-16T12:00:00Z').service.getCalendar('user-1', {
      from: '2026-10-14',
      to: '2026-10-16',
      timeZone: 'America/New_York',
    })

    const utcByDate = new Map(utc.days.map((day) => [day.date, day]))
    const nyByDate = new Map(newYork.days.map((day) => [day.date, day]))

    // 2026-10-16T02:00Z is still 2026-10-15 in New York.
    expect(utcByDate.get('2026-10-15')?.totalMinutes).toBe(0)
    expect(nyByDate.get('2026-10-15')?.totalMinutes).toBe(30)
    expect(nyByDate.get('2026-10-16')?.totalMinutes).toBe(55)
  })

  it('keeps days exactly aligned across a DST transition', async () => {
    const { service } = serviceAt('2026-10-16T12:00:00Z', {
      sessions: [
        // 23:30 on 2026-03-07 in New York (EST)
        { startedAt: '2026-03-08T04:30:00Z', durationMinutes: 20 },
        // 00:30 on 2026-03-08 in New York (EST, one hour later on the clock)
        { startedAt: '2026-03-08T05:30:00Z', durationMinutes: 20 },
        // 23:30 on 2026-03-08 in New York (EDT)
        { startedAt: '2026-03-09T03:30:00Z', durationMinutes: 20 },
      ],
    })

    const calendar = await service.getCalendar('user-1', {
      from: '2026-03-07',
      to: '2026-03-09',
      timeZone: 'America/New_York',
    })

    const byDate = new Map(calendar.days.map((day) => [day.date, day]))
    expect(calendar.days).toHaveLength(3)
    expect(byDate.get('2026-03-07')?.totalMinutes).toBe(20)
    expect(byDate.get('2026-03-08')?.totalMinutes).toBe(40)
    expect(byDate.get('2026-03-09')?.totalMinutes).toBe(0)
    expect(byDate.get('2026-03-08')?.qualified).toBe(true)
  })

  it('uses configurable intensity thresholds from the request', async () => {
    const { service } = serviceAt('2026-10-16T12:00:00Z')

    const calendar = await service.getCalendar('user-1', {
      from: '2026-10-14',
      to: '2026-10-14',
      intensityThresholds: [10, 20, 30],
      streakQualifyingMinutes: 90,
    })

    expect(calendar.intensityThresholds).toEqual([10, 20, 30])
    expect(calendar.maxIntensityLevel).toBe(4)
    expect(calendar.streakQualifyingMinutes).toBe(90)
    expect(calendar.days[0]).toMatchObject({ totalMinutes: 60, intensity: 4, qualified: false })
    expect(calendar.intensityLevels.map((level) => level.label)).toEqual([
      'No study',
      '1–10 min',
      '11–20 min',
      '21–30 min',
      '31+ min',
    ])
  })

  it('falls back to stored thresholds, then to the built-in defaults', async () => {
    const stored = serviceAt('2026-10-16T12:00:00Z', {
      settings: {
        intensityThresholds: [15, 45],
        streakQualifyingMinutes: 45,
        updatedAt: new Date('2026-10-01T00:00:00Z'),
      },
    })

    const calendar = await stored.service.getCalendar('user-1', {
      from: '2026-10-14',
      to: '2026-10-14',
    })

    expect(calendar.intensityThresholds).toEqual([15, 45])
    expect(calendar.maxIntensityLevel).toBe(3)
    expect(calendar.streakQualifyingMinutes).toBe(45)
    expect(calendar.days[0]).toMatchObject({ totalMinutes: 60, intensity: 3, qualified: true })
  })

  it('summarises the range', async () => {
    const { service } = serviceAt('2026-10-16T12:00:00Z')

    const calendar = await service.getCalendar('user-1', {
      from: '2026-10-12',
      to: '2026-10-20',
    })

    expect(calendar.summary).toEqual({
      totalMinutes: 235,
      sessionCount: 6,
      activeDays: 3,
      qualifyingDays: 3,
      averageMinutesPerActiveDay: 78,
      bestDay: { date: '2026-10-20', totalMinutes: 90 },
    })
  })

  it('returns an empty grid when the user has no sessions', async () => {
    const { service } = serviceAt('2026-10-16T12:00:00Z', { sessions: [] })

    const calendar = await service.getCalendar('user-1', {
      from: '2026-01-01',
      to: '2026-01-03',
    })

    expect(calendar.days).toHaveLength(3)
    expect(calendar.days.every((day) => day.totalMinutes === 0 && day.intensity === 0)).toBe(true)
    expect(calendar.summary.bestDay).toBeNull()
    expect(calendar.summary.averageMinutesPerActiveDay).toBe(0)
  })
})

describe('day detail', () => {
  it('breaks a day down by skill, category and topic', async () => {
    const { service } = serviceAt('2026-10-16T12:00:00Z')

    const detail = await service.getDayDetail('user-1', '2026-10-14')

    expect(detail).toMatchObject({
      date: '2026-10-14',
      timezone: 'UTC',
      totalMinutes: 60,
      sessionCount: 2,
      intensity: 3,
      qualified: true,
      streakQualifyingMinutes: 20,
      firstSessionLocalTime: '10:00',
      lastSessionLocalTime: '18:15',
    })
    expect(detail.skills).toEqual([
      {
        skillId: 'skill-grammar',
        name: 'Grammar',
        minutes: 45,
        sessionCount: 1,
        percentage: 75,
      },
      {
        skillId: 'skill-listening',
        name: 'Listening',
        minutes: 15,
        sessionCount: 1,
        percentage: 25,
      },
    ])
    expect(detail.categories).toEqual([
      {
        categoryId: 'category-ielts',
        name: 'IELTS',
        minutes: 45,
        sessionCount: 1,
        percentage: 75,
      },
      { categoryId: null, name: 'Uncategorised', minutes: 15, sessionCount: 1, percentage: 25 },
    ])
    expect(detail.topics).toEqual([
      { topic: 'Articles', minutes: 45, sessionCount: 1, percentage: 75 },
    ])
    expect(detail.notes).toEqual([
      {
        sessionId: 'session-3',
        topic: 'Articles',
        notes: 'Focused on definite articles',
        durationMinutes: 45,
        startedAt: '2026-10-14T10:00:00.000Z',
      },
    ])
    expect(detail.sessions).toHaveLength(2)
    expect(detail.sessions[0]).toMatchObject({
      id: 'session-3',
      skillName: 'Grammar',
      categoryName: 'IELTS',
      topic: 'Articles',
      selfRating: 4,
      durationMinutes: 45,
      isManual: true,
    })
  })

  it('treats whitespace-only notes as no notes', async () => {
    const { service } = serviceAt('2026-10-16T12:00:00Z')

    const detail = await service.getDayDetail('user-1', '2026-10-16')

    expect(detail.notes).toEqual([])
    expect(detail.sessionCount).toBe(3)
  })

  it('returns an empty detail payload for a day without sessions', async () => {
    const { service } = serviceAt('2026-10-16T12:00:00Z')

    const detail = await service.getDayDetail('user-1', '2026-10-15')

    expect(detail).toMatchObject({
      date: '2026-10-15',
      totalMinutes: 0,
      sessionCount: 0,
      intensity: 0,
      qualified: false,
      firstSessionLocalTime: null,
      lastSessionLocalTime: null,
    })
    expect(detail.sessions).toEqual([])
    expect(detail.skills).toEqual([])
    expect(detail.categories).toEqual([])
    expect(detail.topics).toEqual([])
    expect(detail.notes).toEqual([])
  })

  it('uses the requested timezone for the day window and labels', async () => {
    const { service } = serviceAt('2026-10-16T12:00:00Z')

    const detail = await service.getDayDetail('user-1', '2026-10-15', {
      timeZone: 'America/New_York',
    })

    expect(detail.timezone).toBe('America/New_York')
    expect(detail.totalMinutes).toBe(30)
    expect(detail.firstSessionLocalTime).toBe('22:00')
    expect(detail.lastSessionLocalTime).toBe('22:30')
  })

  it('rejects an impossible date', async () => {
    const { service } = serviceAt('2026-10-16T12:00:00Z')

    await expect(service.getDayDetail('user-1', '2026-02-30')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    })
    await expect(service.getDayDetail('user-1', 'yesterday')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    })
  })

  it('honours per-request thresholds and the streak rule', async () => {
    const { service } = serviceAt('2026-10-16T12:00:00Z')

    const detail = await service.getDayDetail('user-1', '2026-10-14', {
      intensityThresholds: [10, 20],
      streakQualifyingMinutes: 90,
    })

    expect(detail.intensityThresholds).toEqual([10, 20])
    expect(detail.intensity).toBe(3)
    expect(detail.streakQualifyingMinutes).toBe(90)
    expect(detail.qualified).toBe(false)
  })
})

describe('calendar settings', () => {
  it('reports the built-in defaults until the user changes them', async () => {
    const { service } = serviceAt('2026-10-16T12:00:00Z')

    const settings = await service.getSettings('user-1')

    expect(settings).toMatchObject({
      timezone: 'UTC',
      today: '2026-10-16',
      intensityThresholds: [20, 40, 60, 90],
      streakQualifyingMinutes: 20,
      source: 'DEFAULT',
      updatedAt: null,
    })
    expect(settings.intensityLevels.map((level) => level.label)).toContain('91+ min')
  })

  it('persists and normalises a new configuration', async () => {
    const { service, state } = serviceAt('2026-10-16T12:00:00Z')

    const updated = await service.updateSettings('user-1', {
      intensityThresholds: [60, 20, 40],
      streakQualifyingMinutes: 30,
    })

    expect(state.upserts).toEqual([
      {
        userId: 'user-1',
        data: { intensityThresholds: [20, 40, 60], streakQualifyingMinutes: 30 },
      },
    ])
    expect(updated).toMatchObject({
      intensityThresholds: [20, 40, 60],
      streakQualifyingMinutes: 30,
      source: 'USER',
      updatedAt: '2026-10-16T12:00:00.000Z',
    })

    // …and the stored values now drive the calendar and streak endpoints.
    const calendar = await service.getCalendar('user-1', {
      from: '2026-10-14',
      to: '2026-10-14',
    })
    expect(calendar.intensityThresholds).toEqual([20, 40, 60])
    expect(calendar.streakQualifyingMinutes).toBe(30)

    const streak = await service.getStreak('user-1')
    expect(streak.qualifyingMinutes).toBe(30)
  })

  it('updates one field without touching the other', async () => {
    const { service, state } = serviceAt('2026-10-16T12:00:00Z', {
      settings: {
        intensityThresholds: [10, 30],
        streakQualifyingMinutes: 45,
        updatedAt: new Date('2026-10-01T00:00:00Z'),
      },
    })

    await service.updateSettings('user-1', { streakQualifyingMinutes: 25 })

    expect(state.upserts).toEqual([{ userId: 'user-1', data: { streakQualifyingMinutes: 25 } }])
  })

  it('allows a timezone override on the settings read', async () => {
    const { service } = serviceAt('2026-10-16T12:00:00Z')

    const settings = await service.getSettings('user-1', { timeZone: 'Europe/Berlin' })

    expect(settings.timezone).toBe('Europe/Berlin')
  })

  it('rejects an unusable timezone override', async () => {
    const { service } = serviceAt('2026-10-16T12:00:00Z')

    await expect(service.getSettings('user-1', { timeZone: 'Nowhere' })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    })
  })
})

// ─── HTTP surface ────────────────────────────────────────────────────────────

function createFakePrisma(options: StubOptions = {}) {
  const { repository, state } = createStubRepository(options)

  // The routes wire the *real* repository onto this stubbed client, so the stub
  // only has to emulate the Prisma surface that repository touches: filtering
  // `studySession` rows by a half-open `startedAt` window, reading the user's
  // timezone, and reading/writing the calendar settings row.
  return {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id ? { timezone: options.timeZone ?? 'UTC' } : null,
    },
    studySession: {
      findMany: async (args: { where?: { startedAt?: { gte?: Date; lt?: Date } } }) =>
        repository.listSessionsBetween(
          'user-1',
          args.where?.startedAt?.gte ?? new Date('1970-01-01T00:00:00Z'),
          args.where?.startedAt?.lt ?? new Date('2100-01-01T00:00:00Z'),
        ),
    },
    calendarSetting: {
      findUnique: async () => repository.getSettings('user-1'),
      upsert: async ({ create }: { create: Record<string, unknown> }) => {
        await repository.upsertSettings('user-1', create)
        return state.settings
      },
    },
  }
}

async function buildTestApp(options: StubOptions = {}) {
  const app = Fastify({ logger: false })
  await app.register(errorHandlerPlugin)
  app.decorate('prisma', createFakePrisma(options) as unknown as PrismaClient)
  await app.register(calendarRoutes, { prefix: '/api/v1' })
  await app.ready()
  return app
}

describe('GET /api/v1/calendar', () => {
  it('returns a full year of days for a chosen year', async () => {
    const app = await buildTestApp()

    const response = await app.inject({ method: 'GET', url: '/api/v1/calendar?year=2020' })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.range.from).toBe('2020-01-01')
    expect(body.range.to).toBe('2020-12-31')
    expect(body.range.year).toBe(2020)
    expect(body.days).toHaveLength(366)
    expect(body.summary.totalMinutes).toBe(110)
    expect(body.intensityLevels).toHaveLength(6)
    expect(body.maxIntensityLevel).toBe(5)
    expect(body.streakQualifyingMinutes).toBe(20)

    await app.close()
  })

  it('accepts a custom range and configurable thresholds', async () => {
    const app = await buildTestApp()

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/calendar?from=2026-10-14&to=2026-10-14&intensityThresholds=10,20,30',
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.range).toMatchObject({ kind: 'CUSTOM', from: '2026-10-14', to: '2026-10-14' })
    expect(body.days).toHaveLength(1)
    expect(body.days[0]).toMatchObject({ totalMinutes: 60, intensity: 4, sessionCount: 2 })
    expect(body.intensityThresholds).toEqual([10, 20, 30])

    await app.close()
  })

  it('accepts an array-shaped intensityThresholds parameter', async () => {
    const app = await buildTestApp()

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/calendar?from=2026-10-14&to=2026-10-14&intensityThresholds=15&intensityThresholds=45',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().intensityThresholds).toEqual([15, 45])

    await app.close()
  })

  it('honours a timezone override', async () => {
    const app = await buildTestApp()

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/calendar?from=2026-10-15&to=2026-10-15&timezone=America/New_York',
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.timezone).toBe('America/New_York')
    expect(body.days[0].totalMinutes).toBe(30)

    await app.close()
  })

  it('returns an empty range for a year without sessions', async () => {
    const app = await buildTestApp()

    const response = await app.inject({ method: 'GET', url: '/api/v1/calendar?year=1999' })

    expect(response.statusCode).toBe(200)
    expect(response.json().summary).toMatchObject({ totalMinutes: 0, activeDays: 0, bestDay: null })

    await app.close()
  })

  it('rejects malformed queries with 422', async () => {
    const app = await buildTestApp()

    const urls = [
      '/api/v1/calendar?from=2026-03-01',
      '/api/v1/calendar?to=2026-03-01',
      '/api/v1/calendar?from=2026-02-30&to=2026-03-01',
      '/api/v1/calendar?from=2026-03-05&to=2026-03-01',
      '/api/v1/calendar?year=2026&from=2026-03-01&to=2026-03-02',
      '/api/v1/calendar?from=2000-01-01&to=2026-12-31',
      '/api/v1/calendar?timezone=Mars/Olympus',
      '/api/v1/calendar?streakQualifyingMinutes=abc',
      '/api/v1/calendar?year=2026&intensityThresholds=0',
      '/api/v1/calendar?year=2026&intensityThresholds=20,20',
    ]

    for (const url of urls) {
      const response = await app.inject({ method: 'GET', url })
      expect(response.statusCode, url).toBe(422)
      expect(response.json().error.code, url).toBe('VALIDATION_ERROR')
    }

    await app.close()
  })
})

describe('GET /api/v1/calendar/day/:date', () => {
  it('returns the drill-down for a day', async () => {
    const app = await buildTestApp()

    const response = await app.inject({ method: 'GET', url: '/api/v1/calendar/day/2020-02-29' })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body).toMatchObject({
      date: '2020-02-29',
      totalMinutes: 60,
      sessionCount: 1,
      intensity: 3,
      qualified: true,
    })
    expect(body.sessions).toHaveLength(1)
    expect(body.skills).toHaveLength(1)

    await app.close()
  })

  it('returns zeros for a day without sessions', async () => {
    const app = await buildTestApp()

    const response = await app.inject({ method: 'GET', url: '/api/v1/calendar/day/2020-03-01' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      totalMinutes: 0,
      sessionCount: 0,
      intensity: 0,
      qualified: false,
      sessions: [],
    })

    await app.close()
  })

  it('rejects invalid dates with 422', async () => {
    const app = await buildTestApp()

    for (const url of [
      '/api/v1/calendar/day/2020-02-30',
      '/api/v1/calendar/day/2020-13-01',
      '/api/v1/calendar/day/not-a-date',
      '/api/v1/calendar/day/2020-1-1',
    ]) {
      const response = await app.inject({ method: 'GET', url })
      expect(response.statusCode, url).toBe(422)
    }

    await app.close()
  })
})

describe('GET /api/v1/streak', () => {
  it('returns the current and longest streak', async () => {
    const app = await buildTestApp()

    const response = await app.inject({ method: 'GET', url: '/api/v1/streak' })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body).toMatchObject({
      timezone: 'UTC',
      qualifyingMinutes: 20,
      longestStreak: 1,
    })
    expect(body.longestStreakStart).toBe('2020-01-15')
    expect(body.totalQualifiedDays).toBeGreaterThan(0)

    await app.close()
  })

  it('accepts a qualifying-minutes override', async () => {
    const app = await buildTestApp()

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/streak?streakQualifyingMinutes=100',
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.qualifyingMinutes).toBe(100)
    expect(body.longestStreak).toBe(0)

    await app.close()
  })

  it('rejects an unusable timezone override', async () => {
    const app = await buildTestApp()

    const response = await app.inject({ method: 'GET', url: '/api/v1/streak?timezone=Nope/Nope' })

    expect(response.statusCode).toBe(422)
    expect(response.json().error.code).toBe('VALIDATION_ERROR')

    await app.close()
  })
})

describe('calendar settings endpoints', () => {
  it('reads the defaults and persists an update', async () => {
    const app = await buildTestApp()

    const initial = await app.inject({ method: 'GET', url: '/api/v1/calendar/settings' })
    expect(initial.statusCode).toBe(200)
    expect(initial.json()).toMatchObject({
      intensityThresholds: [20, 40, 60, 90],
      streakQualifyingMinutes: 20,
      source: 'DEFAULT',
    })

    const updated = await app.inject({
      method: 'PUT',
      url: '/api/v1/calendar/settings',
      payload: { intensityThresholds: [45, 15, 30], streakQualifyingMinutes: 45 },
    })
    expect(updated.statusCode).toBe(200)
    expect(updated.json()).toMatchObject({
      intensityThresholds: [15, 30, 45],
      streakQualifyingMinutes: 45,
      source: 'USER',
    })

    const reread = await app.inject({ method: 'GET', url: '/api/v1/calendar/settings' })
    expect(reread.json()).toMatchObject({
      intensityThresholds: [15, 30, 45],
      streakQualifyingMinutes: 45,
      source: 'USER',
    })

    await app.close()
  })

  it('rejects malformed settings payloads with 422', async () => {
    const app = await buildTestApp()

    const payloads = [
      {},
      { intensityThresholds: [] },
      { intensityThresholds: [0] },
      { intensityThresholds: [-10] },
      { streakQualifyingMinutes: -5 },
      { streakQualifyingMinutes: 5000 },
      { intensityThresholds: '20,40' },
      { colourScheme: 'dark' },
    ]

    for (const payload of payloads) {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/v1/calendar/settings',
        payload,
      })
      expect(response.statusCode, JSON.stringify(payload)).toBe(422)
    }

    await app.close()
  })
})
