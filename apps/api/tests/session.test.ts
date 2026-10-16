import { describe, it, expect } from 'vitest'
import { createSessionService } from '../src/modules/sessions/session.service.js'
import type { SessionRepository } from '../src/modules/sessions/session.repository.js'
import type { StreakReader } from '../src/modules/calendar/calendar.service.js'
import type { StreakSummaryResponse } from '@lingopath/types'

/**
 * Real service-level tests for the Phase 4 session rules. The previous version of
 * this file re-derived the implementation's arithmetic instead of importing it, so
 * it passed even if the whole module was deleted (audit finding F11).
 */

const STREAK_STUB: StreakReader = async (): Promise<StreakSummaryResponse> => ({
  timezone: 'UTC',
  qualifyingMinutes: 20,
  currentStreak: 0,
  longestStreak: 0,
  currentStreakStart: null,
  currentStreakEnd: null,
  longestStreakStart: null,
  longestStreakEnd: null,
  today: '2026-10-16',
  todayMinutes: 0,
  todayQualified: false,
  todayPending: false,
  lastQualifiedDate: null,
  totalQualifiedDays: 0,
  minutesToQualifyToday: 20,
})

interface Harness {
  service: ReturnType<typeof createSessionService>
  created: Array<Record<string, unknown>>
  updated: Array<Record<string, unknown>>
}

function harness(
  options: {
    planExists?: boolean
    milestone?: { id: string; planId: string; userId: string } | null
    existing?: Record<string, unknown> | null
  } = {},
): Harness {
  const created: Array<Record<string, unknown>> = []
  const updated: Array<Record<string, unknown>> = []

  const repository = {
    findMany: async () => ({ items: [], nextCursor: null, hasMore: false }),
    getTodayStats: async () => ({ todaySessions: [], totalMinutes: 0 }),
    findPlanById: async (id: string) => (options.planExists === false ? null : { id }),
    findMilestoneById: async (id: string) =>
      options.milestone
        ? { id, planId: options.milestone.planId, plan: { userId: options.milestone.userId } }
        : null,
    findById: async () => options.existing ?? null,
    create: async (_userId: string, data: Record<string, unknown>) => {
      created.push(data)
      return { id: 'session-new', ...data }
    },
    update: async (id: string, _userId: string, data: Record<string, unknown>) => {
      updated.push(data)
      return { id, ...data }
    },
    delete: async () => undefined,
  } as unknown as SessionRepository

  return { service: createSessionService(repository, { getStreak: STREAK_STUB }), created, updated }
}

const baseCreate = {
  skillId: '11111111-1111-4111-8111-111111111111',
  startedAt: '2026-10-16T10:00:00.000Z',
  endedAt: '2026-10-16T10:30:00.000Z',
  isManual: true,
}

describe('session duration rules', () => {
  it('rejects a session shorter than one minute instead of rounding it up', async () => {
    const { service, created } = harness()

    await expect(
      service.createSession('user-1', {
        ...baseCreate,
        endedAt: '2026-10-16T10:00:30.000Z',
      }),
    ).rejects.toThrow('Session duration must be at least 1 minute')
    expect(created).toHaveLength(0)
  })

  it('accepts exactly one minute', async () => {
    const { service, created } = harness()

    await service.createSession('user-1', {
      ...baseCreate,
      endedAt: '2026-10-16T10:01:00.000Z',
    })

    expect(created[0]).toMatchObject({ durationMinutes: 1 })
  })

  it('accepts exactly 16 hours and rejects one minute more', async () => {
    const { service } = harness()

    await expect(
      service.createSession('user-1', {
        ...baseCreate,
        endedAt: '2026-10-17T02:00:00.000Z',
      }),
    ).resolves.toBeDefined()

    await expect(
      service.createSession('user-1', {
        ...baseCreate,
        endedAt: '2026-10-17T02:01:00.000Z',
      }),
    ).rejects.toThrow(/cannot exceed 960 minutes/)
  })

  it('rejects inverted and unparseable timestamps', async () => {
    const { service } = harness()

    await expect(
      service.createSession('user-1', {
        ...baseCreate,
        endedAt: '2026-10-16T09:00:00.000Z',
      }),
    ).rejects.toThrow('endedAt must be after startedAt')

    await expect(
      service.createSession('user-1', { ...baseCreate, startedAt: 'not-a-date' }),
    ).rejects.toThrow('startedAt and endedAt must be valid dates')
  })

  it('recomputed the duration when only one timestamp changes', async () => {
    const { service, updated } = harness({
      existing: {
        id: 'session-1',
        startedAt: new Date('2026-10-16T10:00:00Z'),
        endedAt: new Date('2026-10-16T10:30:00Z'),
        planId: null,
        milestoneId: null,
      },
    })

    await service.updateSession('session-1', 'user-1', {
      endedAt: '2026-10-16T11:00:00.000Z',
    })

    expect(updated[0]).toMatchObject({ durationMinutes: 60 })
  })
})

describe('session attribution rules', () => {
  const milestoneId = '22222222-2222-4222-8222-222222222222'
  const planId = '33333333-3333-4333-8333-333333333333'

  it('rejects a milestone that belongs to another plan', async () => {
    const { service } = harness({
      milestone: { id: milestoneId, planId: 'other-plan', userId: 'user-1' },
    })

    await expect(
      service.createSession('user-1', { ...baseCreate, planId, milestoneId }),
    ).rejects.toThrow('milestoneId does not belong to the given planId')
  })

  it('rejects a milestone the user does not own', async () => {
    const { service } = harness({
      milestone: { id: milestoneId, planId, userId: 'someone-else' },
    })

    await expect(service.createSession('user-1', { ...baseCreate, milestoneId })).rejects.toThrow(
      `Milestone '${milestoneId}' not found`,
    )
  })

  it('rejects an unknown plan', async () => {
    const { service } = harness({ planExists: false })

    await expect(service.createSession('user-1', { ...baseCreate, planId })).rejects.toThrow(
      `Plan '${planId}' not found`,
    )
  })

  it('derives the plan from the milestone so every plan query agrees', async () => {
    const { service, created } = harness({
      milestone: { id: milestoneId, planId, userId: 'user-1' },
    })

    await service.createSession('user-1', { ...baseCreate, milestoneId })

    expect(created[0]).toMatchObject({ planId, milestoneId })
  })

  it('accepts a plan without a milestone', async () => {
    const { service, created } = harness({ planExists: true })

    await service.createSession('user-1', { ...baseCreate, planId })

    expect(created[0]).toMatchObject({ planId })
  })
})
