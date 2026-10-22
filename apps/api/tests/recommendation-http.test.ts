import { describe, it, expect } from 'vitest'
import Fastify from 'fastify'
import type { PrismaClient } from '@prisma/client'
import errorHandlerPlugin from '../src/plugins/error-handler.js'
import recommendationRoutes from '../src/modules/recommendations/recommendation.routes.js'
import { createUnavailableLlmAdapter, type LlmAdapter } from '../src/modules/recommendations/recommendation.llm.js'

/**
 * HTTP surface of the recommendation module.
 *
 * The fake Prisma answers the aggregation queries with an empty account, which is
 * the interesting case for the controller: the pipeline still has to produce a
 * valid recommendation ("start your study record") rather than an error, and every
 * route has to keep its contract — including refusing an unconfirmed apply.
 */

interface StoredRecommendation {
  id: string
  userId: string
  type: string
  title: string
  recommendation: string
  rationale: string
  supportingData: unknown
  confidence: string
  estimatedDurationMinutes: number | null
  relatedSkillId: string | null
  relatedGoalId: string | null
  relatedPlanId: string | null
  objectiveId: string | null
  objectiveType: string | null
  source: string
  evidenceKey: string
  suggestedAction: unknown
  status: string
  generatedAt: Date
  expiresAt: Date | null
  decidedAt: Date | null
  appliedAt: Date | null
  appliedGoalId: string | null
}

function createFakePrisma() {
  const rows: StoredRecommendation[] = []
  const feedback: Array<{
    id: string
    userId: string
    recommendationId: string
    action: string
    reason: string | null
    createdAt: Date
  }> = []
  let sequence = 0
  let feedbackSequence = 0
  const createdGoals: Array<Record<string, unknown>> = []

  const matches = (row: StoredRecommendation, where: Record<string, unknown> | undefined) => {
    if (!where) return true
    if (where['id'] !== undefined && row.id !== where['id']) return false
    if (where['userId'] !== undefined && row.userId !== where['userId']) return false
    const status = where['status']
    if (typeof status === 'string' && row.status !== status) return false
    if (
      status !== null &&
      typeof status === 'object' &&
      'in' in (status as Record<string, unknown>) &&
      !(status as { in: string[] }).in.includes(row.status)
    ) {
      return false
    }
    if (where['appliedAt'] === null && row.appliedAt !== null) return false
    const expiresAt = where['expiresAt'] as { lt?: Date } | undefined
    if (expiresAt && expiresAt.lt instanceof Date) {
      if (row.expiresAt === null || row.expiresAt.getTime() >= expiresAt.lt.getTime()) return false
    }
    return true
  }

  const prisma = {
    user: {
      findUnique: async () => ({ timezone: 'UTC', activeObjective: null }),
    },
    learningObjective: {
      count: async () => 0,
    },
    calendarSetting: {
      findUnique: async () => null,
    },
    studySession: {
      findMany: async () => [],
      findFirst: async () => null,
      groupBy: async () => [],
      aggregate: async () => ({ _sum: { durationMinutes: 0 } }),
    },
    $queryRaw: async (strings: TemplateStringsArray) => {
      const sql = Array.isArray(strings) ? strings.join(' ') : String(strings)
      if (sql.includes('percentile_cont')) return [{ medianMinutes: null, startHour: null }]
      if (sql.includes('COUNT(DISTINCT')) {
        return [
          { minutes: 0, sessions: 0, activeDays: 0, firstStartedAt: null, lastStartedAt: null },
        ]
      }
      return []
    },
    skill: { findMany: async () => [] },
    goal: {
      findMany: async () => [],
      findFirst: async () => null,
      create: async (args: { data: Record<string, unknown> }) => {
        createdGoals.push(args.data)
        return { id: 'goal-1', ...args.data }
      },
    },
    longTermPlan: { findMany: async () => [], findFirst: async () => null },
    planMilestone: { findMany: async () => [] },
    levelAssessment: { findMany: async () => [] },
    exam: { findMany: async () => [], findFirst: async () => null },
    recommendationFeedback: {
      findMany: async (args: { where?: { userId?: string; action?: string }; take?: number }) => {
        const where = args.where ?? {}
        return feedback
          .filter((entry) => (where.userId ? entry.userId === where.userId : true))
          .filter((entry) => (where.action ? entry.action === where.action : true))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(0, args.take ?? 20)
          .map((entry) => {
            const recommendation = rows.find((row) => row.id === entry.recommendationId)
            return {
              id: entry.id,
              action: entry.action,
              reason: entry.reason,
              createdAt: entry.createdAt,
              recommendation: {
                id: recommendation?.id,
                type: recommendation?.type,
                title: recommendation?.title,
                recommendation: recommendation?.recommendation,
                rationale: recommendation?.rationale,
                confidence: recommendation?.confidence,
                relatedSkillId: recommendation?.relatedSkillId ?? null,
                status: recommendation?.status,
                appliedAt: recommendation?.appliedAt ?? null,
                appliedGoalId: recommendation?.appliedGoalId ?? null,
              },
            }
          })
      },
      create: async (args: { data: Record<string, unknown> }) => {
        feedbackSequence += 1
        feedback.push({
          id: `fb-${feedbackSequence}`,
          userId: String(args.data['userId']),
          recommendationId: String(args.data['recommendationId']),
          action: String(args.data['action']),
          reason: (args.data['reason'] as string | null) ?? null,
          createdAt: (args.data['createdAt'] as Date) ?? new Date(),
        })
        return { id: `fb-${feedbackSequence}` }
      },
    },
    recommendation: {
      create: async (args: { data: Record<string, unknown> }) => {
        sequence += 1
        const row = {
          id: `rec-${sequence}`,
          status: 'NEW',
          decidedAt: null,
          appliedAt: null,
          appliedGoalId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...args.data,
        } as unknown as StoredRecommendation
        rows.push(row)
        return row
      },
      findMany: async (args: { where?: Record<string, unknown> }) =>
        rows.filter((row) => matches(row, args.where)),
      findFirst: async (args: { where?: Record<string, unknown> }) =>
        rows.find((row) => matches(row, args.where)) ?? null,
      findUnique: async (args: { where: { id: string } }) =>
        rows.find((row) => row.id === args.where.id) ?? null,
      updateMany: async (args: {
        where?: Record<string, unknown>
        data: Record<string, unknown>
      }) => {
        const affected = rows.filter((row) => matches(row, args.where))
        for (const row of affected) Object.assign(row, args.data)
        return { count: affected.length }
      },
    },
    $transaction: async (arg: unknown) => {
      if (Array.isArray(arg)) return Promise.all(arg)
      if (typeof arg === 'function') return (arg as (tx: unknown) => Promise<unknown>)(prisma)
      return []
    },
  }

  return { prisma: prisma as unknown as PrismaClient, rows, feedback, createdGoals }
}

async function buildTestApp(options: { llmAdapter?: LlmAdapter } = {}) {
  const { prisma, rows, feedback, createdGoals } = createFakePrisma()
  const app = Fastify({ logger: false })
  await app.register(errorHandlerPlugin)
  app.decorate('prisma', prisma)
  await app.register(recommendationRoutes, {
    prefix: '/api/v1',
    llmAdapter: options.llmAdapter ?? createUnavailableLlmAdapter(),
  })
  await app.ready()
  return { app, rows, feedback, createdGoals }
}

describe('POST /api/v1/recommendations/generate', () => {
  it('generates, stores and returns a recommendation for an empty account', async () => {
    const { app, rows } = await buildTestApp()

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/recommendations/generate',
      payload: {},
    })

    expect(response.statusCode).toBe(201)
    const body = response.json()

    expect(body.data).toHaveLength(1)
    expect(body.data[0].type).toBe('CONSISTENCY')
    expect(body.data[0].confidence).toBe('LOW')
    expect(body.data[0].status).toBe('NEW')
    expect(body.data[0].source).toBe('RULE_BASED')
    expect(body.meta.source).toBe('RULE_BASED')
    expect(body.meta.confidenceCeiling).toBe('LOW')
    expect(body.meta.dataQuality.sessionCount).toBe(0)
    expect(rows).toHaveLength(1)

    await app.close()
  })

  it('rejects a malformed body', async () => {
    const { app } = await buildTestApp()

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/recommendations/generate',
      payload: { refresh: 'maybe' },
    })

    expect(response.statusCode).toBe(422)
    expect(response.json().error.code).toBe('VALIDATION_ERROR')

    await app.close()
  })

  it('returns the open batch without generating when refresh is false', async () => {
    const { app, rows } = await buildTestApp()
    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/recommendations/generate',
      payload: {},
    })
    const firstId = first.json().data[0].id

    const replay = await app.inject({
      method: 'POST',
      url: '/api/v1/recommendations/generate',
      payload: { refresh: false },
    })

    expect(replay.statusCode).toBe(201)
    expect(replay.json().data.map((item: { id: string }) => item.id)).toEqual([firstId])
    // Regression: the flag was parsed and discarded, so this call used to spend a
    // generation and supersede the learner's own open batch.
    expect(replay.json().meta.llm.attempted).toBe(false)
    expect(replay.json().meta.llm.reason).toMatch(/current batch/i)
    expect(replay.json().meta.notes.join(' ')).toMatch(/generated earlier/i)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.status).toBe('NEW')

    await app.close()
  })

  it('generates a fresh batch when refresh is true or omitted', async () => {
    const { app, rows } = await buildTestApp()
    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/recommendations/generate',
      payload: {},
    })
    const firstId = first.json().data[0].id

    const second = await app.inject({
      method: 'POST',
      url: '/api/v1/recommendations/generate',
      payload: { refresh: true },
    })

    expect(second.statusCode).toBe(201)
    expect(second.json().data[0].id).not.toBe(firstId)
    expect(rows).toHaveLength(2)
    // A new batch retires the old one; two live batches would ask the learner to
    // answer two versions of the same observation.
    expect(rows[0]?.status).toBe('SUPERSEDED')

    await app.close()
  })

  it('still answers when the model provider throws', async () => {
    const broken: LlmAdapter = {
      provider: 'broken',
      model: null,
      configured: true,
      complete: async () => {
        throw new Error('socket hang up')
      },
    }
    const { app, rows } = await buildTestApp({ llmAdapter: broken })

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/recommendations/generate',
      payload: {},
    })

    // Scenario 9: a provider outage must not become an API error. The main
    // application, and this endpoint, keep working from the rule engine.
    expect(response.statusCode).toBe(201)
    expect(response.json().data.length).toBeGreaterThan(0)
    expect(response.json().data.every((item: { source: string }) => item.source === 'RULE_BASED')).toBe(
      true,
    )
    expect(response.json().meta.llm).toMatchObject({ attempted: true, available: false })
    expect(rows).toHaveLength(1)

    await app.close()
  })
})

describe('GET /api/v1/recommendations', () => {
  it('lists what was generated and filters by status', async () => {
    const { app } = await buildTestApp()
    await app.inject({ method: 'POST', url: '/api/v1/recommendations/generate', payload: {} })

    const all = await app.inject({ method: 'GET', url: '/api/v1/recommendations' })
    expect(all.statusCode).toBe(200)
    expect(all.json().data).toHaveLength(1)

    const none = await app.inject({ method: 'GET', url: '/api/v1/recommendations?status=REJECTED' })
    expect(none.statusCode).toBe(200)
    expect(none.json().data).toHaveLength(0)

    await app.close()
  })

  it('rejects an unknown status filter', async () => {
    const { app } = await buildTestApp()

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/recommendations?status=MAYBE',
    })

    expect(response.statusCode).toBe(422)
    await app.close()
  })

  it('keeps an accepted but unapplied row in the actionable view', async () => {
    const { app } = await buildTestApp()
    const generated = await app.inject({
      method: 'POST',
      url: '/api/v1/recommendations/generate',
      payload: {},
    })
    const id = generated.json().data[0].id

    const fresh = await app.inject({
      method: 'GET',
      url: '/api/v1/recommendations?actionable=true',
    })
    expect(fresh.json().data).toHaveLength(1)

    await app.inject({
      method: 'POST',
      url: `/api/v1/recommendations/${id}/feedback`,
      payload: { action: 'ACCEPTED' },
    })

    const accepted = await app.inject({
      method: 'GET',
      url: '/api/v1/recommendations?actionable=true',
    })
    expect(accepted.json().data).toHaveLength(1)
    expect(accepted.json().data[0].status).toBe('ACCEPTED')

    await app.inject({
      method: 'POST',
      url: `/api/v1/recommendations/${id}/apply`,
      payload: { confirm: true, period: 'DAILY', targetMinutes: 20 },
    })

    const applied = await app.inject({
      method: 'GET',
      url: '/api/v1/recommendations?actionable=true',
    })
    expect(applied.json().data).toHaveLength(0)

    await app.close()
  })
})

describe('GET /api/v1/recommendations/history', () => {
  it('returns each decision with the wording it was taken on', async () => {
    const { app } = await buildTestApp()
    const generated = await app.inject({
      method: 'POST',
      url: '/api/v1/recommendations/generate',
      payload: {},
    })
    const item = generated.json().data[0]

    await app.inject({
      method: 'POST',
      url: `/api/v1/recommendations/${item.id}/feedback`,
      payload: { action: 'REJECTED', reason: 'Not this month' },
    })

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/recommendations/history',
    })

    expect(response.statusCode).toBe(200)
    const entry = response.json().data[0]
    expect(entry).toMatchObject({
      recommendationId: item.id,
      action: 'REJECTED',
      reason: 'Not this month',
      title: item.title,
      recommendation: item.recommendation,
      rationale: item.rationale,
      status: 'REJECTED',
      appliedAt: null,
    })
    expect(response.json().meta).toEqual({ count: 1, limit: 20 })

    await app.close()
  })

  it('filters by action and rejects an unknown one', async () => {
    const { app } = await buildTestApp()
    const generated = await app.inject({
      method: 'POST',
      url: '/api/v1/recommendations/generate',
      payload: {},
    })
    const id = generated.json().data[0].id

    await app.inject({
      method: 'POST',
      url: `/api/v1/recommendations/${id}/feedback`,
      payload: { action: 'POSTPONED' },
    })

    const postponed = await app.inject({
      method: 'GET',
      url: '/api/v1/recommendations/history?action=POSTPONED',
    })
    expect(postponed.statusCode).toBe(200)
    expect(postponed.json().data).toHaveLength(1)

    const rejected = await app.inject({
      method: 'GET',
      url: '/api/v1/recommendations/history?action=REJECTED',
    })
    expect(rejected.json().data).toHaveLength(0)

    const invalid = await app.inject({
      method: 'GET',
      url: '/api/v1/recommendations/history?action=LIKED',
    })
    expect(invalid.statusCode).toBe(422)

    await app.close()
  })

  it('is empty before any decision is taken', async () => {
    const { app } = await buildTestApp()

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/recommendations/history',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().data).toEqual([])

    await app.close()
  })
})

describe('POST /api/v1/recommendations/:id/feedback', () => {
  it('asks the follow-up question after an acceptance', async () => {
    const { app } = await buildTestApp()
    const generated = await app.inject({
      method: 'POST',
      url: '/api/v1/recommendations/generate',
      payload: {},
    })
    const id = generated.json().data[0].id

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/recommendations/${id}/feedback`,
      payload: { action: 'ACCEPTED' },
    })

    expect(response.statusCode).toBe(201)
    expect(response.json().data.status).toBe('ACCEPTED')
    expect(response.json().meta.followUp.question).toBe('Add this to your plan?')
    // The "start your study record" recommendation has no goal to create.
    expect(response.json().meta.followUp.canApply).toBe(false)

    await app.close()
  })

  it('rejects an unknown action', async () => {
    const { app } = await buildTestApp()
    const generated = await app.inject({
      method: 'POST',
      url: '/api/v1/recommendations/generate',
      payload: {},
    })
    const id = generated.json().data[0].id

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/recommendations/${id}/feedback`,
      payload: { action: 'LIKED' },
    })

    expect(response.statusCode).toBe(422)
    await app.close()
  })

  it('404s for an unknown recommendation', async () => {
    const { app } = await buildTestApp()

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/recommendations/00000000-0000-4000-8000-000000000000/feedback',
      payload: { action: 'ACCEPTED' },
    })

    expect(response.statusCode).toBe(404)
    await app.close()
  })
})

describe('POST /api/v1/recommendations/:id/apply', () => {
  it('refuses an apply without the explicit confirmation flag', async () => {
    const { app, rows } = await buildTestApp()
    const generated = await app.inject({
      method: 'POST',
      url: '/api/v1/recommendations/generate',
      payload: {},
    })
    const id = generated.json().data[0].id

    await app.inject({
      method: 'POST',
      url: `/api/v1/recommendations/${id}/feedback`,
      payload: { action: 'ACCEPTED' },
    })

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/recommendations/${id}/apply`,
      payload: {},
    })

    expect(response.statusCode).toBe(422)
    expect(rows[0]?.appliedAt).toBeNull()

    await app.close()
  })

  it('refuses an apply before the recommendation was accepted', async () => {
    const { app } = await buildTestApp()
    const generated = await app.inject({
      method: 'POST',
      url: '/api/v1/recommendations/generate',
      payload: {},
    })
    const id = generated.json().data[0].id

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/recommendations/${id}/apply`,
      payload: { confirm: true },
    })

    expect(response.statusCode).toBe(409)
    expect(response.json().error.code).toBe('CONFLICT')

    await app.close()
  })

  it('writes the item the learner confirmed, with its topic and day', async () => {
    const { app, createdGoals } = await buildTestApp()
    const generated = await app.inject({
      method: 'POST',
      url: '/api/v1/recommendations/generate',
      payload: {},
    })
    const id = generated.json().data[0].id

    await app.inject({
      method: 'POST',
      url: `/api/v1/recommendations/${id}/feedback`,
      payload: { action: 'ACCEPTED' },
    })

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/recommendations/${id}/apply`,
      payload: {
        confirm: true,
        period: 'DAILY',
        targetMinutes: 45,
        skillId: null,
        topic: 'IELTS Task 2',
        startDate: '2026-10-17T00:00:00.000Z',
        endDate: '2026-10-17T23:59:59.999Z',
      },
    })

    expect(response.statusCode).toBe(201)
    expect(response.json().meta.goalId).toBe('goal-1')
    expect(createdGoals).toHaveLength(1)
    expect(createdGoals[0]).toMatchObject({
      period: 'DAILY',
      targetMinutes: 45,
      topic: 'IELTS Task 2',
      isActive: true,
    })
    // The real goal repository stores instants, so the fake sees `Date` values.
    expect((createdGoals[0]?.['startDate'] as Date).toISOString()).toBe('2026-10-17T00:00:00.000Z')
    expect((createdGoals[0]?.['endDate'] as Date).toISOString()).toBe('2026-10-17T23:59:59.999Z')

    const history = await app.inject({
      method: 'GET',
      url: '/api/v1/recommendations/history',
    })
    expect(history.json().data[0].appliedAt).not.toBeNull()

    await app.close()
  })
})
