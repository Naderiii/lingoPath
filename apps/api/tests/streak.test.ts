import { describe, it, expect } from 'vitest'
import type { CalendarRepository } from '../src/modules/calendar/calendar.repository.js'
import { createCalendarService } from '../src/modules/calendar/calendar.service.js'
import { computeStreakSummary } from '../src/modules/calendar/calendar.domain.js'

/**
 * Phase 7 streak rules.
 *
 * Two layers:
 *  - `computeStreakSummary` is exercised directly with explicit per-day totals,
 *    which is where the awkward cases live (midnight, month/year/leap boundaries,
 *    missed days, ties).
 *  - The service layer is exercised through a stub repository and a fixed clock,
 *    which is where timezone and DST behaviour lives.
 */

interface StubSession {
  userId?: string
  startedAt: Date
  durationMinutes: number
}

function session(iso: string, durationMinutes: number, userId?: string): StubSession {
  return { userId, startedAt: new Date(iso), durationMinutes }
}

function createStubRepository(input: {
  sessions: StubSession[]
  timeZone?: string
  settings?: {
    intensityThresholds: number[]
    streakQualifyingMinutes: number
    updatedAt: Date
  } | null
}): CalendarRepository {
  const sessions = [...input.sessions].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())

  const within = (userId: string, from: Date, to: Date): StubSession[] =>
    sessions.filter((entry) => (!entry.userId || entry.userId === userId) && entry.startedAt >= from && entry.startedAt < to)

  return {
    listActivitySessions: async (userId: string) =>
      sessions.filter((entry) => !entry.userId || entry.userId === userId),
    listActivitySessionsBetween: async (userId: string, from: Date, to: Date) => within(userId, from, to),
    listSessionsBetween: async () => [] as never,
    getUserTimeZone: async () => input.timeZone ?? 'UTC',
    getSettings: async () => input.settings ?? null,
    upsertSettings: async () => {
      throw new Error('upsertSettings is not used by these tests')
    },
  } as unknown as CalendarRepository
}

function serviceAt(clockIso: string, input: Parameters<typeof createStubRepository>[0]) {
  const repository = createStubRepository(input)
  return createCalendarService(repository, { now: () => new Date(clockIso) })
}

describe('computeStreakSummary — day totals', () => {
  const today = '2026-10-16'

  it('counts a single qualifying day that includes today', () => {
    const streak = computeStreakSummary({
      dayMinutes: new Map([[today, 20]]),
      todayKey: today,
      qualifyingMinutes: 20,
    })

    expect(streak).toMatchObject({
      currentStreak: 1,
      longestStreak: 1,
      currentStreakStart: today,
      currentStreakEnd: today,
      longestStreakStart: today,
      longestStreakEnd: today,
      todayQualified: true,
      todayPending: false,
      lastQualifiedDate: today,
      totalQualifiedDays: 1,
      minutesToQualifyToday: 0,
    })
  })

  it('keeps the streak alive while today is still pending', () => {
    const streak = computeStreakSummary({
      dayMinutes: new Map([
        ['2026-10-14', 20],
        ['2026-10-15', 20],
      ]),
      todayKey: today,
      qualifyingMinutes: 20,
    })

    expect(streak).toMatchObject({
      currentStreak: 2,
      currentStreakStart: '2026-10-14',
      currentStreakEnd: '2026-10-15',
      todayQualified: false,
      todayPending: true,
      todayMinutes: 0,
      lastQualifiedDate: '2026-10-15',
      minutesToQualifyToday: 20,
    })
  })

  it('breaks the streak once a full day is missed', () => {
    const streak = computeStreakSummary({
      dayMinutes: new Map([
        ['2026-10-12', 60],
        ['2026-10-13', 60],
      ]),
      todayKey: today,
      qualifyingMinutes: 20,
    })

    expect(streak).toMatchObject({
      currentStreak: 0,
      currentStreakStart: null,
      currentStreakEnd: null,
      todayPending: false,
      longestStreak: 2,
      longestStreakStart: '2026-10-12',
      longestStreakEnd: '2026-10-13',
      totalQualifiedDays: 2,
    })
  })

  it('does not count a short day as qualifying', () => {
    const streak = computeStreakSummary({
      dayMinutes: new Map([
        ['2026-10-15', 19],
        [today, 19],
      ]),
      todayKey: today,
      qualifyingMinutes: 20,
    })

    expect(streak).toMatchObject({
      currentStreak: 0,
      longestStreak: 0,
      todayQualified: false,
      todayMinutes: 19,
      minutesToQualifyToday: 1,
      totalQualifiedDays: 0,
    })
  })

  it('honours a custom qualifying threshold', () => {
    const dayMinutes = new Map([
      ['2026-10-15', 25],
      [today, 25],
    ])

    expect(
      computeStreakSummary({ dayMinutes, todayKey: today, qualifyingMinutes: 20 }).currentStreak,
    ).toBe(2)
    expect(
      computeStreakSummary({ dayMinutes, todayKey: today, qualifyingMinutes: 30 }).currentStreak,
    ).toBe(0)
    expect(
      computeStreakSummary({ dayMinutes, todayKey: today, qualifyingMinutes: 25 }).currentStreak,
    ).toBe(2)
  })

  it('accepts a threshold of zero as “any study counts, but an empty day never does”', () => {
    const streak = computeStreakSummary({
      dayMinutes: new Map([
        ['2026-10-14', 0],
        ['2026-10-15', 1],
      ]),
      todayKey: today,
      qualifyingMinutes: 0,
    })

    expect(streak.currentStreak).toBe(1)
    expect(streak.currentStreakStart).toBe('2026-10-15')
    expect(streak.minutesToQualifyToday).toBe(1)
  })

  it('crosses month boundaries', () => {
    const streak = computeStreakSummary({
      dayMinutes: new Map([
        ['2026-01-30', 30],
        ['2026-01-31', 30],
        ['2026-02-01', 30],
        ['2026-02-02', 30],
      ]),
      todayKey: '2026-02-02',
      qualifyingMinutes: 20,
    })

    expect(streak.currentStreak).toBe(4)
    expect(streak.currentStreakStart).toBe('2026-01-30')
    expect(streak.longestStreak).toBe(4)
  })

  it('crosses year boundaries', () => {
    const streak = computeStreakSummary({
      dayMinutes: new Map([
        ['2025-12-30', 30],
        ['2025-12-31', 30],
        ['2026-01-01', 30],
      ]),
      todayKey: '2026-01-01',
      qualifyingMinutes: 20,
    })

    expect(streak.currentStreak).toBe(3)
    expect(streak.currentStreakStart).toBe('2025-12-30')
    expect(streak.currentStreakEnd).toBe('2026-01-01')
  })

  it('treats a leap day as a normal day', () => {
    const withLeapDay = computeStreakSummary({
      dayMinutes: new Map([
        ['2024-02-28', 30],
        ['2024-02-29', 30],
        ['2024-03-01', 30],
      ]),
      todayKey: '2024-03-01',
      qualifyingMinutes: 20,
    })
    expect(withLeapDay.currentStreak).toBe(3)

    // Without the leap day the run is broken, which proves the 29th was counted.
    const withoutLeapDay = computeStreakSummary({
      dayMinutes: new Map([
        ['2024-02-28', 30],
        ['2024-03-01', 30],
      ]),
      todayKey: '2024-03-01',
      qualifyingMinutes: 20,
    })
    expect(withoutLeapDay.currentStreak).toBe(1)
    expect(withoutLeapDay.longestStreak).toBe(1)
  })

  it('reports the longest run, not the current one', () => {
    const dayMinutes = new Map<string, number>()
    for (const day of ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05']) {
      dayMinutes.set(day, 45)
    }
    for (const day of ['2026-10-14', '2026-10-15', today]) dayMinutes.set(day, 45)

    const streak = computeStreakSummary({ dayMinutes, todayKey: today, qualifyingMinutes: 20 })

    expect(streak.currentStreak).toBe(3)
    expect(streak.longestStreak).toBe(5)
    expect(streak.longestStreakStart).toBe('2026-09-01')
    expect(streak.longestStreakEnd).toBe('2026-09-05')
    expect(streak.currentStreakStart).toBe('2026-10-14')
  })

  it('prefers the earliest run when two runs tie for longest', () => {
    const streak = computeStreakSummary({
      dayMinutes: new Map([
        ['2026-09-01', 30],
        ['2026-09-02', 30],
        ['2026-10-14', 30],
        ['2026-10-15', 30],
      ]),
      todayKey: today,
      qualifyingMinutes: 20,
    })

    expect(streak.longestStreak).toBe(2)
    expect(streak.longestStreakStart).toBe('2026-09-01')
    expect(streak.longestStreakEnd).toBe('2026-09-02')
  })

  it('never lets a future day create a streak', () => {
    const streak = computeStreakSummary({
      dayMinutes: new Map([
        ['2026-10-17', 120],
        ['2026-10-18', 120],
      ]),
      todayKey: today,
      qualifyingMinutes: 20,
    })

    expect(streak).toMatchObject({
      currentStreak: 0,
      longestStreak: 0,
      totalQualifiedDays: 0,
      lastQualifiedDate: null,
    })
  })

  it('ignores malformed day keys instead of crashing', () => {
    const streak = computeStreakSummary({
      dayMinutes: new Map([
        ['not-a-day', 90],
        ['2026-10-15', 30],
      ]),
      todayKey: today,
      qualifyingMinutes: 20,
    })

    expect(streak.currentStreak).toBe(1)
    expect(streak.totalQualifiedDays).toBe(1)
  })

  it('handles a multi-year unbroken run', () => {
    const dayMinutes = new Map<string, number>()
    let cursor = '2024-01-01'
    for (let index = 0; index < 1000; index++) {
      dayMinutes.set(cursor, 20)
      const [year, month, day] = cursor.split('-').map(Number)
      const next = new Date(Date.UTC(year!, month! - 1, day! + 1))
      cursor = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`
    }

    const streak = computeStreakSummary({
      dayMinutes,
      todayKey: cursor,
      qualifyingMinutes: 20,
    })

    expect(streak.currentStreak).toBe(1000)
    expect(streak.longestStreak).toBe(1000)
    expect(streak.totalQualifiedDays).toBe(1000)
  })
})

describe('streaks through the calendar service (timezone aware)', () => {
  it('sums several sessions on one day into a single qualifying day', async () => {
    const service = serviceAt('2026-10-16T12:00:00Z', {
      timeZone: 'America/New_York',
      sessions: [
        session('2026-10-16T12:00:00Z', 5),
        session('2026-10-16T13:00:00Z', 8),
        session('2026-10-16T14:00:00Z', 7),
      ],
    })

    const streak = await service.getStreak('user-1')

    expect(streak.currentStreak).toBe(1)
    expect(streak.todayMinutes).toBe(20)
    expect(streak.todayQualified).toBe(true)
    expect(streak.timezone).toBe('America/New_York')
  })

  it('counts sessions on the user’s local day, not the UTC day', async () => {
    // 2026-10-16T02:00Z is 22:00 on 2026-10-15 in New York.
    const midnightCrossing = [
      session('2026-10-15T12:00:00Z', 25),
      session('2026-10-16T02:00:00Z', 25),
    ]

    const newYork = await serviceAt('2026-10-16T12:00:00Z', {
      timeZone: 'America/New_York',
      sessions: midnightCrossing,
    }).getStreak('user-1')

    expect(newYork.currentStreak).toBe(1)
    expect(newYork.todayQualified).toBe(false)
    expect(newYork.todayPending).toBe(true)
    expect(newYork.lastQualifiedDate).toBe('2026-10-15')

    const utc = await serviceAt('2026-10-16T12:00:00Z', {
      timeZone: 'UTC',
      sessions: midnightCrossing,
    }).getStreak('user-1')

    expect(utc.currentStreak).toBe(2)
    expect(utc.lastQualifiedDate).toBe('2026-10-16')
  })

  it('puts a session starting exactly at local midnight on the new day', async () => {
    const service = serviceAt('2026-10-16T12:00:00Z', {
      timeZone: 'America/New_York',
      // 04:00Z is exactly 00:00 EDT on 2026-10-16.
      sessions: [session('2026-10-16T04:00:00Z', 20)],
    })

    const streak = await service.getStreak('user-1')

    expect(streak.todayQualified).toBe(true)
    expect(streak.lastQualifiedDate).toBe('2026-10-16')
  })

  it('keeps a session that runs past midnight on the day it started', async () => {
    const service = serviceAt('2026-10-16T12:00:00Z', {
      timeZone: 'America/New_York',
      // Starts 2026-10-15T23:50 local and ends 2026-10-16T00:10 local.
      sessions: [session('2026-10-16T03:50:00Z', 20)],
    })

    const streak = await service.getStreak('user-1')

    expect(streak.lastQualifiedDate).toBe('2026-10-15')
    expect(streak.todayQualified).toBe(false)
    expect(streak.currentStreak).toBe(1)
  })

  it('counts a 23-hour DST day exactly once and keeps the run intact', async () => {
    const service = serviceAt('2026-03-09T20:00:00Z', {
      timeZone: 'America/New_York',
      sessions: [
        session('2026-03-07T15:00:00Z', 30), // 10:00 EST on 03-07
        // Two sessions on the spring-forward day, either side of the skipped hour.
        session('2026-03-08T05:30:00Z', 10), // 00:30 EST on 03-08
        session('2026-03-09T03:30:00Z', 10), // 23:30 EDT on 03-08
        session('2026-03-09T15:00:00Z', 30), // 11:00 EDT on 03-09
      ],
    })

    const streak = await service.getStreak('user-1')

    expect(streak.currentStreak).toBe(3)
    expect(streak.currentStreakStart).toBe('2026-03-07')
    expect(streak.currentStreakEnd).toBe('2026-03-09')
    expect(streak.todayMinutes).toBe(30)
  })

  it('counts a 25-hour DST day exactly once, even with both sides of the repeated hour', async () => {
    const service = serviceAt('2026-11-01T18:00:00Z', {
      timeZone: 'America/New_York',
      sessions: [
        session('2026-11-01T05:30:00Z', 15), // 01:30 EDT (before the fall-back)
        session('2026-11-01T06:30:00Z', 15), // 01:30 EST (after the fall-back)
      ],
    })

    const streak = await service.getStreak('user-1')

    expect(streak.todayMinutes).toBe(30)
    expect(streak.todayQualified).toBe(true)
    expect(streak.currentStreak).toBe(1)
    expect(streak.totalQualifiedDays).toBe(1)
  })

  it('does not let a session on a later local day leak into today', async () => {
    // 2026-10-16T10:00Z is 19:00 on 2026-10-16 in Tokyo, while 2026-10-17T01:00Z
    // is 10:00 on 2026-10-17, which is “today” for the 22:00Z clock.
    const service = serviceAt('2026-10-16T22:00:00Z', {
      timeZone: 'Asia/Tokyo',
      sessions: [session('2026-10-16T10:00:00Z', 60), session('2026-10-17T01:00:00Z', 60)],
    })

    const streak = await service.getStreak('user-1')

    expect(streak.today).toBe('2026-10-17')
    expect(streak.currentStreak).toBe(2)
    expect(streak.todayMinutes).toBe(60)
  })

  it('uses the stored preference when the request does not override it', async () => {
    const sessions = [
      session('2026-10-15T12:00:00Z', 25), // qualifies at 20, not at 30
      session('2026-10-16T12:00:00Z', 25),
    ]

    const defaultRule = await serviceAt('2026-10-16T18:00:00Z', {
      timeZone: 'UTC',
      sessions,
    }).getStreak('user-1')
    expect(defaultRule.qualifyingMinutes).toBe(20)
    expect(defaultRule.currentStreak).toBe(2)

    const storedRule = await serviceAt('2026-10-16T18:00:00Z', {
      timeZone: 'UTC',
      sessions,
      settings: {
        intensityThresholds: [20, 40, 60, 90],
        streakQualifyingMinutes: 30,
        updatedAt: new Date('2026-10-01T00:00:00Z'),
      },
    }).getStreak('user-1')
    expect(storedRule.qualifyingMinutes).toBe(30)
    expect(storedRule.currentStreak).toBe(0)

    const override = await serviceAt('2026-10-16T18:00:00Z', {
      timeZone: 'UTC',
      sessions,
      settings: {
        intensityThresholds: [20, 40, 60, 90],
        streakQualifyingMinutes: 30,
        updatedAt: new Date('2026-10-01T00:00:00Z'),
      },
    }).getStreak('user-1', { streakQualifyingMinutes: 20 })
    expect(override.qualifyingMinutes).toBe(20)
    expect(override.currentStreak).toBe(2)
  })

  it('rejects an unusable timezone override', async () => {
    const service = serviceAt('2026-10-16T12:00:00Z', { sessions: [] })

    await expect(service.getStreak('user-1', { timeZone: 'Mars/Olympus' })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    })
  })

  it('falls back to UTC when the stored timezone is nonsense', async () => {
    const service = serviceAt('2026-10-16T12:00:00Z', {
      timeZone: 'Not/AZone',
      sessions: [session('2026-10-16T12:00:00Z', 30)],
    })

    const streak = await service.getStreak('user-1')

    expect(streak.timezone).toBe('UTC')
    expect(streak.today).toBe('2026-10-16')
    expect(streak.currentStreak).toBe(1)
  })

  it('respects user isolation on repository listActivitySessionsBetween', async () => {
    const service = serviceAt('2026-10-16T12:00:00Z', {
      timeZone: 'UTC',
      sessions: [
        { userId: 'user-1', startedAt: new Date('2026-10-16T10:00:00Z'), durationMinutes: 30 },
        { userId: 'user-2', startedAt: new Date('2026-10-16T10:00:00Z'), durationMinutes: 60 },
      ],
    })

    const streak1 = await service.getStreak('user-1')
    expect(streak1.totalQualifiedDays).toBe(1)

    const streak2 = await service.getStreak('user-2')
    expect(streak2.totalQualifiedDays).toBe(1)
  })
})
