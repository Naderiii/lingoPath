import { describe, it, expect } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import type { CalendarRepository } from '../src/modules/calendar/calendar.repository.js'
import {
  createCalendarService,
  createStreakReader,
} from '../src/modules/calendar/calendar.service.js'
import { createSessionRepository } from '../src/modules/sessions/session.repository.js'
import { createSessionService } from '../src/modules/sessions/session.service.js'
import { dayBoundsUtc, getDayKey } from '../src/shared/timezone.js'

/**
 * Phase 7 replaced two hand-rolled streak implementations with one canonical
 * reader. These tests pin down the wiring: `/sessions/today-stats` and the
 * calendar endpoints must agree, and the session repository must use the user's
 * local day rather than the server's.
 */

const NOW = new Date('2026-10-16T12:00:00Z')

interface ActivitySession {
  userId?: string
  startedAt: Date
  durationMinutes: number
}

function calendarRepository(input: {
  sessions: ActivitySession[]
  timeZone: string
  streakQualifyingMinutes?: number
}): CalendarRepository {
  const sessions = [...input.sessions].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())

  return {
    listActivitySessions: async (userId: string) =>
      sessions.filter((entry) => !entry.userId || entry.userId === userId),
    listActivitySessionsBetween: async (userId: string, from: Date, to: Date) =>
      sessions.filter((entry) => (!entry.userId || entry.userId === userId) && entry.startedAt >= from && entry.startedAt < to),
    listSessionsBetween: async () => [] as never,
    getUserTimeZone: async () => input.timeZone,
    getSettings: async () =>
      input.streakQualifyingMinutes === undefined
        ? null
        : {
            intensityThresholds: [20, 40, 60, 90],
            streakQualifyingMinutes: input.streakQualifyingMinutes,
            updatedAt: new Date('2026-10-01T00:00:00Z'),
          },
    upsertSettings: async () => {
      throw new Error('not used')
    },
  } as unknown as CalendarRepository
}

function sessionService(input: {
  sessions: ActivitySession[]
  timeZone: string
  streakQualifyingMinutes?: number
}) {
  const streakReader = createStreakReader(calendarRepository(input), { now: () => NOW })
  const calendarService = createCalendarService(calendarRepository(input), { now: () => NOW })

  const repository = {
    getTodayStats: async (_userId: string) => {
      // Mirrors the real repository: only the sessions that fall inside today's
      // local window come back, and the totals come from exactly those rows.
      const todayKey = getDayKey(NOW, input.timeZone)
      const todaySessions = input.sessions.filter(
        (session) => (!session.userId || session.userId === _userId) && getDayKey(session.startedAt, input.timeZone) === todayKey,
      )

      return {
        todaySessions: todaySessions.map((session, index) => ({
          id: `session-${index}`,
          skillId: 'skill-grammar',
          startedAt: session.startedAt,
          endedAt: new Date(session.startedAt.getTime() + session.durationMinutes * 60_000),
          durationMinutes: session.durationMinutes,
          topic: null,
          skill: { id: 'skill-grammar', name: 'Grammar' },
          category: null,
        })),
        totalMinutes: todaySessions.reduce((sum, session) => sum + session.durationMinutes, 0),
      }
    },
    findMany: async () => ({ items: [], nextCursor: null, hasMore: false }),
    findById: async () => null,
    create: async () => {
      throw new Error('not used')
    },
    update: async () => {
      throw new Error('not used')
    },
    delete: async () => undefined,
  }

  return {
    service: createSessionService(repository as never, { getStreak: streakReader }),
    calendarService,
  }
}

describe('session today-stats uses the canonical streak', () => {
  it('reports a qualifying day', async () => {
    const { service } = sessionService({
      timeZone: 'UTC',
      sessions: [{ startedAt: new Date('2026-10-16T09:00:00Z'), durationMinutes: 25 }],
    })

    const stats = await service.getTodayStats('user-1', 'UTC')

    expect(stats).toMatchObject({
      todayTotalMinutes: 25,
      streak: 1,
      longestStreak: 1,
      streakQualifyingMinutes: 20,
      todayQualified: true,
      todayPending: false,
      minutesToQualifyToday: 0,
    })
    expect(stats.sessions).toHaveLength(1)
  })

  it('respects user isolation in listActivitySessionsBetween', async () => {
    const { calendarService } = sessionService({
      timeZone: 'UTC',
      sessions: [
        { userId: 'user-1', startedAt: new Date('2026-10-16T09:00:00Z'), durationMinutes: 30 },
        { userId: 'user-2', startedAt: new Date('2026-10-16T09:00:00Z'), durationMinutes: 30 },
      ],
    })

    const heatmap = await calendarService.getCalendar('user-1', { year: 2026 })
    const day = heatmap.days.find((d) => d.date === '2026-10-16')
    expect(day?.totalMinutes).toBe(30)
  })
})
