import { describe, it, expect } from 'vitest'
import Fastify from 'fastify'
import type { PrismaClient } from '@prisma/client'
import errorHandlerPlugin from '../src/plugins/error-handler.js'
import recommendationRoutes from '../src/modules/recommendations/recommendation.routes.js'
import { createUnavailableLlmAdapter } from '../src/modules/recommendations/recommendation.llm.js'

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
  let sequence = 0

  const matches = (row: StoredRecommendation, where: Record<string, unknown> | undefined) => {
    if (!where) return true
    if (where['id'] !== undefined && row.id !== where['id']) return false
    if (where['userId'] !== undefined && row.userId !== where['userId']) return false
    if (where['status'] !== undefined && row.status !== where['status']) return false
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
      create: async (args: { data: Record<string, unknown> }) => ({ id: 'goal-1', ...args.data }),
    },
    longTermPlan: { findMany: async () => [], findFirst: async () => null },
    planMilestone: { findMany: async () => [] },
    levelAssessment: { findMany: async () => [] },
    exam: { findMany: async () => [], findFirst: async () => null },
    recommendationFeedback: { findMany: async () => [], create: async () => ({ id: 'fb-1' }) },
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

  return { prisma: prisma as unknown as PrismaClient, rows }
}

async function buildTestApp() {
  const { prisma, rows } = createFakePrisma()
  const app = Fastify({ logger: false })
  await app.register(errorHandlerPlugin)
  app.decorate('prisma', prisma)
  await app.register(recommendationRoutes, {
    prefix: '/api/v1',
    llmAdapter: createUnavailableLlmAdapter(),
  })
  await app.ready()
  return { app, rows }
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
})
