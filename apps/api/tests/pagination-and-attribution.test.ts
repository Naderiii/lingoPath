import { describe, it, expect } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { EMPTY_PAGE_WHERE, keysetOrderBy, keysetWhere } from '../src/shared/keyset-pagination.js'
import { createPlanRepository } from '../src/modules/plans/plan.repository.js'
import { createSessionRepository } from '../src/modules/sessions/session.repository.js'

/**
 * Regression tests for two confirmed audit defects:
 *
 * 1. Keyset pagination filtered on `id < cursor` while ordering by a timestamp,
 *    so pages skipped and duplicated rows. The fix resolves the cursor row's sort
 *    value and pages on (sort field, id).
 * 2. Plan/milestone attribution silently dropped or re-attributed minutes.
 */

describe('keysetWhere (pure)', () => {
  it('adds no predicate without a cursor', async () => {
    await expect(
      keysetWhere({
        cursor: undefined,
        field: 'startedAt',
        direction: 'desc',
        loadCursorValue: async () => null,
      }),
    ).resolves.toBeUndefined()
  })

  it('pages downwards on the sort field for descending order', async () => {
    const where = await keysetWhere({
      cursor: 'row-5',
      field: 'startedAt',
      direction: 'desc',
      loadCursorValue: async () => new Date('2026-10-16T10:00:00Z'),
    })

    expect(where).toEqual({
      OR: [
        { startedAt: { lt: new Date('2026-10-16T10:00:00Z') } },
        { startedAt: new Date('2026-10-16T10:00:00Z'), id: { lt: 'row-5' } },
      ],
    })
  })

  it('pages upwards on the sort field for ascending order', async () => {
    const where = await keysetWhere({
      cursor: 'row-5',
      field: 'createdAt',
      direction: 'asc',
      loadCursorValue: async () => new Date('2026-10-16T10:00:00Z'),
    })

    expect(where).toEqual({
      OR: [
        { createdAt: { gt: new Date('2026-10-16T10:00:00Z') } },
        { createdAt: new Date('2026-10-16T10:00:00Z'), id: { gt: 'row-5' } },
      ],
    })
  })

  it('ends the list for a stale cursor instead of restarting it', async () => {
    const where = await keysetWhere({
      cursor: 'deleted-row',
      field: 'startedAt',
      direction: 'desc',
      loadCursorValue: async () => null,
    })

    expect(where).toEqual({ ...EMPTY_PAGE_WHERE })
  })

  it('orders by the sort field with id as a deterministic tie-breaker', () => {
    expect(keysetOrderBy('startedAt', 'desc')).toEqual([{ startedAt: 'desc' }, { id: 'desc' }])
    expect(keysetOrderBy('startedAt', 'asc')).toEqual([{ startedAt: 'asc' }, { id: 'asc' }])
  })
})

// ─── Session repository ──────────────────────────────────────────────────────

interface SessionRow {
  id: string
  userId: string
  startedAt: Date
  durationMinutes: number
  createdAt: Date
  skillId: string
  categoryId: string | null
  topic: string | null
  description: string | null
  endedAt: Date
  selfRating: number | null
  notes: string | null
  isManual: boolean
  planId: string | null
  milestoneId: string | null
  updatedAt: Date
}

function sessionRow(id: string, startedAt: string, durationMinutes: number): SessionRow {
  const started = new Date(startedAt)
  return {
    id,
    userId: 'user-1',
    startedAt: started,
    endedAt: new Date(started.getTime() + durationMinutes * 60_000),
    durationMinutes,
    createdAt: started,
    skillId: 'skill-1',
    categoryId: null,
    topic: null,
    description: null,
    selfRating: null,
    notes: null,
    isManual: true,
    planId: null,
    milestoneId: null,
    updatedAt: started,
  }
}

function sessionRepositoryFake(rows: SessionRow[]) {
  const calls: Array<Record<string, unknown>> = []

  const prisma = {
    studySession: {
      findFirst: async (args: { where: { id: string; userId: string } }) =>
        rows.find((row) => row.id === args.where.id && row.userId === args.where.userId) ?? null,
      findMany: async (args: Record<string, unknown>) => {
        calls.push(args)
        return rows
      },
    },
  } as unknown as PrismaClient

  return { repository: createSessionRepository(prisma), calls }
}

describe('session pagination predicate', () => {
  it('continues after the cursor row in startedAt order, tie-broken by id', async () => {
    const { repository, calls } = sessionRepositoryFake([
      sessionRow('session-c', '2026-10-16T09:00:00Z', 30),
      sessionRow('session-b', '2026-10-16T10:00:00Z', 30),
      sessionRow('session-a', '2026-10-16T10:00:00Z', 30),
    ])

    await repository.findMany('user-1', { cursor: 'session-b', limit: 20 })

    const args = calls[0]!
    expect(args['orderBy']).toEqual([{ startedAt: 'desc' }, { id: 'desc' }])
    // Both halves of the composite predicate are present: strictly older rows and
    // equal-timestamp rows with a smaller id.
    expect(args['where']).toMatchObject({
      userId: 'user-1',
      OR: [
        { startedAt: { lt: new Date('2026-10-16T10:00:00Z') } },
        { startedAt: new Date('2026-10-16T10:00:00Z'), id: { lt: 'session-b' } },
      ],
    })
  })

  it('respects an ascending sort order', async () => {
    const { repository, calls } = sessionRepositoryFake([
      sessionRow('session-b', '2026-10-16T10:00:00Z', 30),
    ])

    await repository.findMany('user-1', { cursor: 'session-b', limit: 20, sortOrder: 'asc' })

    expect(calls[0]!['orderBy']).toEqual([{ startedAt: 'asc' }, { id: 'asc' }])
  })

  it('returns no rows for a cursor the user cannot see', async () => {
    const { repository, calls } = sessionRepositoryFake([
      sessionRow('session-a', '2026-10-16T10:00:00Z', 30),
    ])

    const page = await repository.findMany('user-1', { cursor: 'someone-elses-row', limit: 20 })

    expect(calls[0]!['where']).toMatchObject({ id: { in: [] } })
    expect(page.hasMore).toBe(false)
    expect(page.nextCursor).toBeNull()
  })
})

// ─── Plan attribution & timezone buckets ─────────────────────────────────────

interface MilestoneRow {
  id: string
  planId: string
  startDate: Date
  endDate: Date
  ordering: number
}

function planRepositoryFake(input: {
  milestones: MilestoneRow[]
  sessions: Array<{
    id: string
    milestoneId: string | null
    durationMinutes: number
    startedAt: Date
    planId?: string | null
  }>
}) {
  const prisma = {
    planMilestone: {
      findMany: async () => [...input.milestones].sort((a, b) => a.ordering - b.ordering),
    },
    studySession: {
      findMany: async () => input.sessions,
    },
    longTermPlan: {
      findFirst: async () => null,
      findMany: async () => [],
    },
    user: { findUnique: async () => ({ timezone: 'UTC' }) },
  } as unknown as PrismaClient

  return createPlanRepository(prisma)
}

describe('plan milestone attribution', () => {
  const october: MilestoneRow = {
    id: 'ms-oct',
    planId: 'plan-1',
    startDate: new Date('2026-10-01T00:00:00Z'),
    endDate: new Date('2026-10-31T23:59:59Z'),
    ordering: 0,
  }
  const november: MilestoneRow = {
    id: 'ms-nov',
    planId: 'plan-1',
    startDate: new Date('2026-11-01T00:00:00Z'),
    endDate: new Date('2026-11-30T23:59:59Z'),
    ordering: 1,
  }

  it('keeps an explicit milestone link and never double counts', async () => {
    const repository = planRepositoryFake({
      milestones: [october, november],
      sessions: [
        {
          id: 's1',
          milestoneId: 'ms-oct',
          durationMinutes: 60,
          startedAt: new Date('2026-11-05T10:00:00Z'),
        },
      ],
    })

    const result = await repository.getActualMinutesByMilestone('plan-1')

    // Tagged October even though the date falls in November's range.
    expect(result.milestones).toEqual([
      { milestoneId: 'ms-oct', totalMinutes: 60 },
      { milestoneId: 'ms-nov', totalMinutes: 0 },
    ])
    expect(result.unassignedMinutes).toBe(0)
  })

  it('attributes an untagged session by date range', async () => {
    const repository = planRepositoryFake({
      milestones: [october, november],
      sessions: [
        {
          id: 's1',
          milestoneId: null,
          durationMinutes: 45,
          startedAt: new Date('2026-11-10T10:00:00Z'),
        },
      ],
    })

    const result = await repository.getActualMinutesByMilestone('plan-1')

    expect(result.milestones).toEqual([
      { milestoneId: 'ms-oct', totalMinutes: 0 },
      { milestoneId: 'ms-nov', totalMinutes: 45 },
    ])
    expect(result.unassignedMinutes).toBe(0)
  })

  it('reports a cross-plan milestone tag as unassigned instead of moving history', async () => {
    const repository = planRepositoryFake({
      milestones: [october, november],
      sessions: [
        // Tagged to a milestone that is not part of this plan.
        {
          id: 's1',
          milestoneId: 'ms-other-plan',
          durationMinutes: 90,
          startedAt: new Date('2026-10-15T10:00:00Z'),
        },
      ],
    })

    const result = await repository.getActualMinutesByMilestone('plan-1')

    expect(result.milestones).toEqual([
      { milestoneId: 'ms-oct', totalMinutes: 0 },
      { milestoneId: 'ms-nov', totalMinutes: 0 },
    ])
    // Its minutes stay visible in the total rather than vanishing.
    expect(result.unassignedMinutes).toBe(90)
  })

  it('reports minutes outside every milestone range as unassigned', async () => {
    const repository = planRepositoryFake({
      milestones: [november],
      sessions: [
        {
          id: 's1',
          milestoneId: null,
          durationMinutes: 30,
          startedAt: new Date('2026-10-05T10:00:00Z'),
        },
      ],
    })

    const result = await repository.getActualMinutesByMilestone('plan-1')

    expect(result.unassignedMinutes).toBe(30)
  })
})

describe('plan week/month buckets use the user timezone', () => {
  function repositoryWithSessions(sessions: Array<{ startedAt: Date; durationMinutes: number }>) {
    const prisma = {
      studySession: { findMany: async () => sessions },
      planMilestone: { findMany: async () => [] },
      longTermPlan: { findFirst: async () => null, findMany: async () => [] },
      user: { findUnique: async () => ({ timezone: 'America/New_York' }) },
    } as unknown as PrismaClient
    return createPlanRepository(prisma)
  }

  const range: [Date, Date] = [new Date('2026-10-01T00:00:00Z'), new Date('2026-12-31T00:00:00Z')]

  it('buckets a Sunday-evening session into the week that is current for the user', async () => {
    // 2026-10-26T01:00Z is Sunday 2026-10-25 21:00 in New York, i.e. the week of Oct 19.
    const repository = repositoryWithSessions([
      { startedAt: new Date('2026-10-26T01:00:00Z'), durationMinutes: 60 },
    ])

    const utc = await repository.getWeeklyActualMinutes('plan-1', range[0], range[1], 'UTC')
    const newYork = await repository.getWeeklyActualMinutes(
      'plan-1',
      range[0],
      range[1],
      'America/New_York',
    )

    expect(utc).toEqual([{ weekStart: '2026-10-26', totalMinutes: 60 }])
    expect(newYork).toEqual([{ weekStart: '2026-10-19', totalMinutes: 60 }])
  })

  it('buckets a month-boundary session into the user’s local month', async () => {
    // 2026-11-01T03:30Z is 2026-10-31 23:30 in New York.
    const repository = repositoryWithSessions([
      { startedAt: new Date('2026-11-01T03:30:00Z'), durationMinutes: 30 },
    ])

    const utc = await repository.getMonthlyActualMinutes('plan-1', range[0], range[1], 'UTC')
    const newYork = await repository.getMonthlyActualMinutes(
      'plan-1',
      range[0],
      range[1],
      'America/New_York',
    )

    expect(utc).toEqual([{ month: '2026-11', totalMinutes: 30 }])
    expect(newYork).toEqual([{ month: '2026-10', totalMinutes: 30 }])
  })
})
