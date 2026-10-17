import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { generateRecommendations } from '../src/modules/recommendations/recommendation.engine.js'
import {
  createUnavailableLlmAdapter,
  extractMessageText,
  type LlmAdapter,
  type LlmResult,
} from '../src/modules/recommendations/recommendation.llm.js'
import {
  buildRecommendationPrompt,
  findReasoningViolation,
  LlmRecommendationResponseSchema,
} from '../src/modules/recommendations/recommendation.prompt.js'
import { createRecommendationService } from '../src/modules/recommendations/recommendation.service.js'
import type { RecommendationContext } from '../src/modules/recommendations/recommendation.context.js'
import type { RecommendationRepository } from '../src/modules/recommendations/recommendation.repository.js'
import type { RecommendationAggregation } from '../src/modules/recommendations/recommendation.aggregation.js'
import { ConflictError, ValidationError } from '../src/shared/errors.js'
import {
  makeContext,
  makeGoal,
  makeObjective,
  SKILL_IDS,
  SKILL_NAMES,
} from './recommendation-fixtures.js'

const USER_ID = '00000000-0000-0000-0000-000000000001'

function stubAdapter(handler: (prompt: { system: string; user: string }) => LlmResult): LlmAdapter {
  return {
    provider: 'stub',
    model: 'stub-model',
    configured: true,
    complete: async (request) => handler(request),
  }
}

function jsonAdapter(payload: unknown): LlmAdapter {
  return stubAdapter(() => ({
    ok: true,
    text: JSON.stringify(payload),
    provider: 'stub',
    model: 'stub-model',
  }))
}

const MISSED_GOAL_CONTEXT = makeContext({
  goals: [makeGoal({ id: 'goal-daily', period: 'DAILY', targetMinutes: 60, percentage: 29 })],
  goalCompletion: { dailyTargetMinutes: 60, daysMeetingTarget: 4, trackedDays: 14, rate: 29 },
})

// ─── LLM failure paths ───────────────────────────────────────────────────────

describe('LLM unavailable', () => {
  it('falls back to the rule engine without throwing', async () => {
    const result = await generateRecommendations(MISSED_GOAL_CONTEXT, {
      llm: createUnavailableLlmAdapter(),
    })

    expect(result.recommendations).toHaveLength(2)
    expect(result.recommendations.every((item) => item.source === 'RULE_BASED')).toBe(true)
    expect(result.llm.attempted).toBe(false)
    expect(result.llm.available).toBe(false)
    expect(result.llm.reason).toMatch(/no language model provider/i)
  })

  it('reports a provider timeout and still answers', async () => {
    const result = await generateRecommendations(MISSED_GOAL_CONTEXT, {
      llm: stubAdapter(() => ({
        ok: false,
        reason: 'TIMEOUT',
        detail: 'Provider did not answer within 20000 ms.',
      })),
    })

    expect(result.recommendations).toHaveLength(2)
    expect(result.recommendations[0]?.source).toBe('RULE_BASED')
    expect(result.llm.attempted).toBe(true)
    expect(result.llm.available).toBe(false)
    expect(result.llm.reason).toContain('timed out')
  })

  it('survives an adapter that throws', async () => {
    const adapter: LlmAdapter = {
      provider: 'broken',
      model: 'broken',
      configured: true,
      complete: async () => {
        throw new Error('socket hang up')
      },
    }

    const result = await generateRecommendations(MISSED_GOAL_CONTEXT, { llm: adapter })

    expect(result.recommendations).toHaveLength(2)
    expect(result.llm.available).toBe(false)
    expect(result.llm.reason).toMatch(/could not be reached/i)
  })
})

describe('malformed LLM output', () => {
  it('discards a response that is not JSON', async () => {
    const result = await generateRecommendations(MISSED_GOAL_CONTEXT, {
      llm: stubAdapter(() => ({
        ok: true,
        text: 'Here are some ideas: study more.',
        provider: 'stub',
        model: 'stub-model',
      })),
    })

    expect(result.recommendations.every((item) => item.source === 'RULE_BASED')).toBe(true)
    expect(result.llm.outputAccepted).toBe(false)
    expect(result.llm.reason).toMatch(/no JSON document/i)
  })

  it('discards invalid JSON', async () => {
    const result = await generateRecommendations(MISSED_GOAL_CONTEXT, {
      llm: stubAdapter(() => ({
        ok: true,
        text: '{"recommendations": [}',
        provider: 'stub',
        model: 'stub-model',
      })),
    })

    expect(result.llm.reason).toMatch(/not valid JSON/i)
    expect(result.recommendations[0]?.source).toBe('RULE_BASED')
  })

  it('discards a document that does not match the schema', async () => {
    const result = await generateRecommendations(MISSED_GOAL_CONTEXT, {
      llm: jsonAdapter({ recommendations: [{ candidateId: 'c1' }] }),
    })

    expect(result.llm.reason).toMatch(/schema/i)
    expect(result.recommendations[0]?.source).toBe('RULE_BASED')
  })

  it('discards a document that references an unknown candidate', async () => {
    const result = await generateRecommendations(MISSED_GOAL_CONTEXT, {
      llm: jsonAdapter({
        recommendations: [
          {
            candidateId: 'c9',
            title: 'Do something',
            recommendation: 'Do something useful for thirty minutes today.',
            rationale: 'Because the data says so, and the data is clear enough.',
            confidence: 'LOW',
            estimatedDurationMinutes: 30,
          },
        ],
      }),
    })

    expect(result.llm.reason).toMatch(/unknown candidate/i)
    expect(result.recommendations[0]?.source).toBe('RULE_BASED')
  })

  it('discards a document that drops a candidate marked mustInclude', async () => {
    const result = await generateRecommendations(MISSED_GOAL_CONTEXT, {
      llm: jsonAdapter({
        recommendations: [
          {
            candidateId: 'c2',
            title: 'Keep the balance',
            recommendation: 'Keep spreading your time across the skills you already study.',
            rationale: 'Your recorded minutes are spread across several skills.',
            confidence: 'MEDIUM',
            estimatedDurationMinutes: null,
          },
        ],
      }),
    })

    expect(result.llm.reason).toMatch(/mustInclude/)
    expect(result.recommendations).toHaveLength(2)
    expect(result.recommendations[0]?.source).toBe('RULE_BASED')
  })
})

// ─── Valid LLM output ────────────────────────────────────────────────────────

describe('valid LLM output', () => {
  const validResponse = {
    recommendations: [
      {
        candidateId: 'c1',
        title: 'Scale the daily goal down for two weeks',
        recommendation:
          'Your 60-minute daily goal was met on 4 of the last 14 days. Try 15 minutes for two weeks, then raise it again.',
        rationale:
          '4 of 14 days met a 60 min target. A smaller target that is met tells you more than a large one that is not.',
        confidence: 'MEDIUM',
        estimatedDurationMinutes: 15,
      },
      {
        candidateId: 'c2',
        title: 'Keep the current split',
        recommendation: 'Your time is spread across several skills; keep it that way for now.',
        rationale: 'The largest share of your study time is 33% of the total.',
        confidence: 'MEDIUM',
        estimatedDurationMinutes: null,
      },
    ],
  }

  it('accepts a grounded rewrite and keeps the engine supporting data', async () => {
    const result = await generateRecommendations(MISSED_GOAL_CONTEXT, {
      llm: jsonAdapter(validResponse),
    })

    expect(result.llm.outputAccepted).toBe(true)
    expect(result.recommendations).toHaveLength(2)
    expect(result.recommendations[0]?.source).toBe('LLM')
    expect(result.recommendations[0]?.title).toBe('Scale the daily goal down for two weeks')

    // The evidence is never model-authored.
    expect(result.recommendations[0]?.supportingData).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'GOALS', value: expect.stringContaining('14') }),
      ]),
    )
  })

  it('accepts a fenced JSON document', async () => {
    const result = await generateRecommendations(MISSED_GOAL_CONTEXT, {
      llm: stubAdapter(() => ({
        ok: true,
        text: `\`\`\`json\n${JSON.stringify(validResponse)}\n\`\`\``,
        provider: 'stub',
        model: 'stub-model',
      })),
    })

    expect(result.llm.outputAccepted).toBe(true)
    expect(result.recommendations[0]?.source).toBe('LLM')
  })

  it('clamps a confidence the evidence cannot support', async () => {
    const thin = makeContext({ sessions: 3, activeDays: 2, assessment: null })

    const result = await generateRecommendations(thin, {
      llm: stubAdapter(() => ({
        ok: true,
        text: JSON.stringify({
          recommendations: [
            {
              candidateId: 'c1',
              title: 'Log more sessions',
              recommendation: 'Log a few more sessions before acting on any pattern here.',
              rationale: 'Only three sessions are recorded, which is a very short history.',
              confidence: 'HIGH',
              estimatedDurationMinutes: 20,
            },
          ],
        }),
        provider: 'stub',
        model: 'stub-model',
      })),
    })

    expect(result.recommendations[0]?.confidence).toBe('LOW')
    expect(result.recommendations[0]?.confidenceBasis).toContain('not a probability')
  })
})

describe('invalid recommendation', () => {
  it('drops prose that diagnoses ability and keeps the rest', async () => {
    const result = await generateRecommendations(MISSED_GOAL_CONTEXT, {
      llm: jsonAdapter({
        recommendations: [
          {
            candidateId: 'c1',
            title: 'Your writing is weak',
            recommendation: 'Your writing is weak, so you need to practise it every day.',
            rationale: 'You have not practised writing much, which means your writing is weak.',
            confidence: 'MEDIUM',
            estimatedDurationMinutes: 30,
          },
          {
            candidateId: 'c2',
            title: 'Keep the current split',
            recommendation: 'Your time is spread across several skills; keep it that way.',
            rationale: 'The largest share of your study time is 33% of the total.',
            confidence: 'MEDIUM',
            estimatedDurationMinutes: null,
          },
        ],
      }),
    })

    expect(result.rejectedByValidation).toBe(1)
    expect(result.recommendations).toHaveLength(1)
    expect(result.recommendations[0]?.candidateId).toContain('balance')
    expect(result.llm.outputAccepted).toBe(true)
  })

  it('falls back entirely when every item is rejected', async () => {
    const result = await generateRecommendations(MISSED_GOAL_CONTEXT, {
      llm: jsonAdapter({
        recommendations: [
          {
            candidateId: 'c1',
            title: 'A prediction',
            recommendation: 'You will definitely reach a band 7 if you keep going like this.',
            rationale: 'Your progress suggests a band 7 is guaranteed within two months.',
            confidence: 'HIGH',
            estimatedDurationMinutes: 30,
          },
        ],
      }),
    })

    expect(result.recommendations).toHaveLength(2)
    expect(result.recommendations[0]?.source).toBe('RULE_BASED')
    expect(result.llm.reason).toMatch(/reasoning guard/i)
  })

  it('detects the reasoning rules it claims to detect', () => {
    expect(findReasoningViolation('Your writing is weak.')).not.toBeNull()
    expect(findReasoningViolation('You are poor at listening.')).not.toBeNull()
    expect(findReasoningViolation('You will get a band 7.')).not.toBeNull()
    expect(findReasoningViolation('You are exam ready.')).not.toBeNull()
    expect(findReasoningViolation('Your last writing session was 19 days ago.')).toBeNull()
  })
})

// ─── Privacy ─────────────────────────────────────────────────────────────────

describe('the model payload', () => {
  it('carries no identity, no timezone and no database ids', () => {
    const context = makeContext({
      objective: makeObjective({ id: 'objective-secret-id' }),
      assessment: { assessedOn: '2026-03-01' },
    })

    const prompt = buildRecommendationPrompt({
      context,
      analysis: {
        confidenceCeiling: 'MEDIUM',
        ceilingRationale: 'Enough history to see a pattern.',
        signals: [],
        dataQuality: {
          level: 'MEDIUM',
          sessionCount: 20,
          activeDays: 16,
          assessmentRecorded: true,
          examResultRecorded: false,
          notes: [],
        },
      },
      candidates: [],
      signals: [],
    })

    expect(prompt.user).not.toContain('objective-secret-id')
    expect(prompt.user).not.toContain(SKILL_IDS.writing)
    expect(prompt.user).not.toContain('displayName')
    expect(prompt.user).not.toContain('timezone')
    expect(prompt.user).not.toContain(USER_ID)
  })

  it('sends skill names, not words the learner wrote', () => {
    const context = makeContext()
    const prompt = buildRecommendationPrompt({
      context,
      analysis: {
        confidenceCeiling: 'MEDIUM',
        ceilingRationale: 'Enough history to see a pattern.',
        signals: [],
        dataQuality: {
          level: 'MEDIUM',
          sessionCount: 20,
          activeDays: 16,
          assessmentRecorded: true,
          examResultRecorded: false,
          notes: [],
        },
      },
      candidates: [],
      signals: [],
    })

    expect(prompt.user).toContain('Writing')
    expect(prompt.user).toContain('recordedAssessment')
  })
})

describe('response contract', () => {
  it('rejects extra fields rather than persisting them', () => {
    const parsed = LlmRecommendationResponseSchema.safeParse({
      recommendations: [
        {
          candidateId: 'c1',
          title: 'Do a thing',
          recommendation: 'Do this thing for thirty minutes this week.',
          rationale: 'Because the recorded sessions show a clear gap here.',
          confidence: 'LOW',
          estimatedDurationMinutes: 30,
          admin: true,
        },
      ],
    })

    expect(parsed.success).toBe(false)
  })

  it('tolerates an optimistic duration bound but not a wild one', () => {
    expect(
      LlmRecommendationResponseSchema.safeParse({
        recommendations: [
          {
            candidateId: 'c1',
            title: 'Do a thing',
            recommendation: 'Do this thing for thirty minutes this week.',
            rationale: 'Because the recorded sessions show a clear gap here.',
            confidence: 'LOW',
            estimatedDurationMinutes: 5000,
          },
        ],
      }).success,
    ).toBe(false)

    expect(
      LlmRecommendationResponseSchema.safeParse({
        recommendations: [
          {
            candidateId: 'c1',
            title: 'Do a thing',
            recommendation: 'Do this thing for thirty minutes this week.',
            rationale: 'Because the recorded sessions show a clear gap here.',
            confidence: 'LOW',
          },
        ],
      }).data?.recommendations[0]?.estimatedDurationMinutes,
    ).toBeNull()
  })
})

describe('provider adapter', () => {
  it('extracts message text from the provider envelope', () => {
    expect(extractMessageText({ choices: [{ message: { content: '{"a":1}' } }] })).toBe('{"a":1}')

    expect(
      extractMessageText({
        choices: [{ message: { content: [{ text: '{"a":' }, { text: '1}' }] } }],
      }),
    ).toBe('{"a":1}')

    expect(extractMessageText({ choices: [] })).toBeNull()
    expect(extractMessageText({ nope: true })).toBeNull()
  })
})

describe('architecture boundary', () => {
  it('keeps the model-facing layer free of database access', () => {
    const directory = join(process.cwd(), 'src', 'modules', 'recommendations')

    for (const file of [
      'recommendation.llm.ts',
      'recommendation.prompt.ts',
      'recommendation.engine.ts',
      'recommendation.analysis.ts',
      'recommendation.candidates.ts',
    ]) {
      const source = readFileSync(join(directory, file), 'utf8')
      expect(source, file).not.toMatch(/PrismaClient/)
      expect(source, file).not.toMatch(/\bprisma\./)
      expect(source, file).not.toMatch(/from '@prisma\/client'/)
    }
  })
})

// ─── Persistence and the decision flow ───────────────────────────────────────

interface StoredRow {
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

function createFakeRepository(initialActiveObjectiveId: string | null = null) {
  const rows: StoredRow[] = []
  const feedback: Array<Record<string, unknown>> = []
  const goals: Array<Record<string, unknown>> = []
  let sequence = 0
  let activeObjectiveId = initialActiveObjectiveId

  const repository = {
    expireStale: vi.fn(async () => ({ count: 0 })),
    supersedeOpen: vi.fn(async () => {
      let count = 0
      for (const row of rows) {
        if (row.status === 'NEW') {
          row.status = 'SUPERSEDED'
          count++
        }
      }
      return { count }
    }),
    createMany: vi.fn(async (userId: string, incoming: Array<Partial<StoredRow>>) => {
      const created = incoming.map((item) => {
        sequence += 1
        const row: StoredRow = {
          id: `rec-${sequence}`,
          userId,
          type: item.type ?? 'CONSISTENCY',
          title: item.title ?? '',
          recommendation: item.recommendation ?? '',
          rationale: item.rationale ?? '',
          supportingData: item.supportingData ?? [],
          confidence: item.confidence ?? 'LOW',
          estimatedDurationMinutes: item.estimatedDurationMinutes ?? null,
          relatedSkillId: item.relatedSkillId ?? null,
          relatedGoalId: item.relatedGoalId ?? null,
          relatedPlanId: item.relatedPlanId ?? null,
          objectiveId: item.objectiveId ?? null,
          objectiveType: item.objectiveType ?? null,
          source: item.source ?? 'RULE_BASED',
          evidenceKey: item.evidenceKey ?? '',
          suggestedAction: item.suggestedAction ?? null,
          status: 'NEW',
          generatedAt: item.generatedAt ?? new Date(),
          expiresAt: item.expiresAt ?? null,
          decidedAt: null,
          appliedAt: null,
          appliedGoalId: null,
        }
        rows.push(row)
        return row
      })
      return created
    }),
    findMany: vi.fn(
      async (_userId: string, filter: { status?: string; type?: string; limit: number }) =>
        rows
          .filter((row) => (filter.status ? row.status === filter.status : true))
          .filter((row) => (filter.type ? row.type === filter.type : true))
          .slice(0, filter.limit),
    ),
    findById: vi.fn(
      async (id: string, userId: string) =>
        rows.find((row) => row.id === id && row.userId === userId) ?? null,
    ),
    recordDecision: vi.fn(
      async (input: {
        recommendationId: string
        userId: string
        action: string
        status: string
        reason: string | null
        at: Date
      }) => {
        const row = rows.find((entry) => entry.id === input.recommendationId)
        if (!row) return { feedbackId: null, recommendation: null }
        row.status = input.status
        row.decidedAt = input.at
        feedback.push({
          id: `fb-${feedback.length + 1}`,
          recommendationId: input.recommendationId,
          userId: input.userId,
          action: input.action,
          reason: input.reason,
          createdAt: input.at,
        })
        return { feedbackId: `fb-${feedback.length}`, recommendation: row }
      },
    ),
    markApplied: vi.fn(async (input: { recommendationId: string; goalId: string; at: Date }) => {
      const row = rows.find((entry) => entry.id === input.recommendationId)
      if (row) {
        row.appliedAt = input.at
        row.appliedGoalId = input.goalId
      }
      return { count: row ? 1 : 0 }
    }),
    listDecisionHistory: vi.fn(async (userId: string, filter: { action?: string; limit: number }) =>
      feedback
        .filter((entry) => entry['userId'] === userId)
        .filter((entry) => (filter.action ? entry['action'] === filter.action : true))
        .map((entry) => {
          const row = rows.find((candidate) => candidate.id === entry['recommendationId'])
          return {
            id: entry['id'],
            action: entry['action'],
            reason: entry['reason'],
            createdAt: entry['createdAt'],
            recommendation: {
              id: row?.id,
              type: row?.type,
              title: row?.title,
              recommendation: row?.recommendation,
              rationale: row?.rationale,
              confidence: row?.confidence,
              relatedSkillId: row?.relatedSkillId ?? null,
              status: row?.status,
              appliedAt: row?.appliedAt ?? null,
              appliedGoalId: row?.appliedGoalId ?? null,
            },
          }
        })
        .slice(0, filter.limit),
    ),
    findUser: vi.fn(async () => ({
      timezone: 'UTC',
      activeObjective: activeObjectiveId === null ? null : { id: activeObjectiveId },
    })),
    getSkillNames: vi.fn(async (ids: readonly string[]) =>
      ids.map((id) => {
        const key = (Object.keys(SKILL_IDS) as Array<keyof typeof SKILL_IDS>).find(
          (candidate) => SKILL_IDS[candidate] === id,
        )
        return { id, name: key === undefined ? 'Unknown skill' : SKILL_NAMES[key] }
      }),
    ),
    goalRepository: {
      create: vi.fn(async (userId: string, data: Record<string, unknown>) => {
        const goal = { id: `goal-${goals.length + 1}`, userId, ...data }
        goals.push(goal)
        return goal
      }),
    },
  }

  return {
    repository: repository as unknown as RecommendationRepository,
    rows,
    feedback,
    goals,
    setActiveObjectiveId(value: string | null) {
      activeObjectiveId = value
    },
  }
}

function createService(
  context: RecommendationContext,
  options: { llm?: LlmAdapter; activeObjectiveId?: string | null } = {},
) {
  const fake = createFakeRepository(options.activeObjectiveId ?? null)
  const aggregation: RecommendationAggregation = {
    buildContext: async () => context,
  }

  const service = createRecommendationService({
    repository: fake.repository,
    aggregation,
    llm: options.llm ?? createUnavailableLlmAdapter(),
    now: () => new Date('2026-03-15T12:00:00Z'),
  })

  return { service, fake }
}

describe('generation', () => {
  it('persists the batch and reports where the wording came from', async () => {
    const { service, fake } = createService(MISSED_GOAL_CONTEXT)

    const result = await service.generate(USER_ID)

    expect(result.data).toHaveLength(2)
    expect(result.meta.source).toBe('RULE_BASED')
    expect(result.meta.llm.available).toBe(false)
    expect(result.meta.confidenceCeiling).toBe('HIGH')
    expect(result.meta.dataQuality.sessionCount).toBe(20)
    expect(fake.rows).toHaveLength(2)
    expect(fake.repository.supersedeOpen).toHaveBeenCalled()
  })

  it('retires the previous batch so two versions never compete', async () => {
    const { service, fake } = createService(MISSED_GOAL_CONTEXT)

    await service.generate(USER_ID)
    await service.generate(USER_ID)

    expect(fake.rows.filter((row) => row.status === 'SUPERSEDED')).toHaveLength(2)
    expect(fake.rows.filter((row) => row.status === 'NEW')).toHaveLength(2)
  })

  it('stores the model wording when it survives validation', async () => {
    const llm = jsonAdapter({
      recommendations: [
        {
          candidateId: 'c1',
          title: 'Ease the daily target',
          recommendation: 'Drop the daily goal to 15 minutes for two weeks, then revisit it.',
          rationale: 'You met a 60-minute target on 4 of the last 14 days, a low hit rate.',
          confidence: 'MEDIUM',
          estimatedDurationMinutes: 15,
        },
        {
          candidateId: 'c2',
          title: 'Keep the split',
          recommendation: 'Your study time is spread across several skills; keep that balance.',
          rationale: 'Your largest single share of study time is 33%.',
          confidence: 'MEDIUM',
          estimatedDurationMinutes: null,
        },
      ],
    })

    const { service } = createService(MISSED_GOAL_CONTEXT, { llm })
    const result = await service.generate(USER_ID)

    expect(result.meta.source).toBe('LLM')
    expect(result.data[0]?.title).toBe('Ease the daily target')
    expect(result.data[0]?.supportingData.length).toBeGreaterThan(0)
  })
})

describe('user decision', () => {
  it('records an acceptance and asks whether to add it to the plan', async () => {
    const { service, fake } = createService(MISSED_GOAL_CONTEXT)
    const generated = await service.generate(USER_ID)
    const target = generated.data[0]

    expect(target).toBeDefined()

    const result = await service.submitFeedback(USER_ID, target!.id, { action: 'ACCEPTED' })

    expect(result.data.status).toBe('ACCEPTED')
    expect(result.data.decidedAt).toBe('2026-03-15T12:00:00.000Z')
    expect(result.meta.followUp).toMatchObject({
      question: 'Add this to your plan?',
      canApply: true,
      action: { kind: 'CREATE_GOAL', period: 'DAILY', targetMinutes: 15 },
    })

    // Recording a decision writes nothing to planning data.
    expect(fake.goals).toHaveLength(0)
    expect(fake.feedback).toHaveLength(1)
    expect(fake.feedback[0]).toMatchObject({ recommendationId: target!.id, action: 'ACCEPTED' })
  })

  it('does not ask a follow-up question when the answer is no', async () => {
    const { service } = createService(MISSED_GOAL_CONTEXT)
    const generated = await service.generate(USER_ID)

    const result = await service.submitFeedback(USER_ID, generated.data[0]!.id, {
      action: 'REJECTED',
      reason: 'Not this month',
    })

    expect(result.data.status).toBe('REJECTED')
    expect(result.meta.followUp).toBeNull()
  })

  it('refuses to answer a recommendation that was already replaced', async () => {
    const { service } = createService(MISSED_GOAL_CONTEXT)
    const first = await service.generate(USER_ID)
    await service.generate(USER_ID)

    await expect(
      service.submitFeedback(USER_ID, first.data[0]!.id, { action: 'ACCEPTED' }),
    ).rejects.toBeInstanceOf(ConflictError)
  })
})

describe('optional action', () => {
  it('refuses to write planning data before the learner has accepted', async () => {
    const { service, fake } = createService(MISSED_GOAL_CONTEXT)
    const generated = await service.generate(USER_ID)

    await expect(
      service.apply(USER_ID, generated.data[0]!.id, { confirm: true }),
    ).rejects.toBeInstanceOf(ConflictError)

    expect(fake.goals).toHaveLength(0)
  })

  it('creates one goal from the suggested action after acceptance', async () => {
    const { service, fake } = createService(MISSED_GOAL_CONTEXT)
    const generated = await service.generate(USER_ID)
    const target = generated.data[0]!

    await service.submitFeedback(USER_ID, target.id, { action: 'ACCEPTED' })
    const applied = await service.apply(USER_ID, target.id, { confirm: true })

    expect(applied.meta.goalId).toBe('goal-1')
    expect(applied.data.appliedAt).toBe('2026-03-15T12:00:00.000Z')
    expect(fake.goals[0]).toMatchObject({
      period: 'DAILY',
      targetMinutes: 15,
      isActive: true,
      startDate: '2026-03-15T12:00:00.000Z',
    })
    // No sessions, milestones or plan edits — one goal, nothing else.
    expect(fake.goals).toHaveLength(1)
  })

  it('lets the learner override the proposed period, target and skill', async () => {
    const context = makeContext({
      lastPractised: {
        vocabulary: 2,
        grammar: 2,
        listening: 2,
        reading: 2,
        writing: 19,
        speaking: 2,
      },
    })
    const { service, fake } = createService(context)
    const generated = await service.generate(USER_ID)
    const target = generated.data.find((item) => item.type === 'SKILL')

    expect(target?.suggestedAction?.period).toBe('WEEKLY')

    await service.submitFeedback(USER_ID, target!.id, { action: 'MODIFIED', reason: 'Monthly' })
    await service.apply(USER_ID, target!.id, {
      confirm: true,
      period: 'MONTHLY',
      targetMinutes: 300,
      skillId: SKILL_IDS.reading,
    })

    expect(fake.goals[0]).toMatchObject({
      period: 'MONTHLY',
      targetMinutes: 300,
      skillTargets: [{ skillId: SKILL_IDS.reading, targetMinutes: 300 }],
    })
  })

  it('writes the topic and the day the learner confirmed', async () => {
    const context = makeContext({
      lastPractised: {
        vocabulary: 2,
        grammar: 2,
        listening: 2,
        reading: 2,
        writing: 19,
        speaking: 2,
      },
    })
    const { service, fake } = createService(context)
    const generated = await service.generate(USER_ID)
    const target = generated.data.find((item) => item.type === 'SKILL')!

    await service.submitFeedback(USER_ID, target.id, { action: 'MODIFIED' })
    await service.apply(USER_ID, target.id, {
      confirm: true,
      period: 'DAILY',
      targetMinutes: 45,
      skillId: SKILL_IDS.writing,
      topic: 'IELTS Task 2',
      startDate: '2026-03-15T00:00:00.000Z',
      endDate: '2026-03-15T23:59:59.999Z',
    })

    expect(fake.goals).toHaveLength(1)
    expect(fake.goals[0]).toMatchObject({
      period: 'DAILY',
      targetMinutes: 45,
      topic: 'IELTS Task 2',
      startDate: '2026-03-15T00:00:00.000Z',
      endDate: '2026-03-15T23:59:59.999Z',
      isActive: true,
      skillTargets: [{ skillId: SKILL_IDS.writing, targetMinutes: 45 }],
    })
  })

  it('refuses an item whose day ends before it starts', async () => {
    const { service } = createService(MISSED_GOAL_CONTEXT)
    const generated = await service.generate(USER_ID)
    const target = generated.data[0]!

    await service.submitFeedback(USER_ID, target.id, { action: 'ACCEPTED' })

    await expect(
      service.apply(USER_ID, target.id, {
        confirm: true,
        targetMinutes: 20,
        startDate: '2026-03-16T00:00:00.000Z',
        endDate: '2026-03-15T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('refuses to apply the same recommendation twice', async () => {
    const { service } = createService(MISSED_GOAL_CONTEXT)
    const generated = await service.generate(USER_ID)
    const target = generated.data[0]!

    await service.submitFeedback(USER_ID, target.id, { action: 'ACCEPTED' })
    await service.apply(USER_ID, target.id, { confirm: true })

    await expect(service.apply(USER_ID, target.id, { confirm: true })).rejects.toBeInstanceOf(
      ConflictError,
    )
  })

  it('refuses to apply advice generated under a different objective', async () => {
    const context = makeContext({
      objective: makeObjective({ id: 'objective-ielts' }),
      exams: [],
    })
    const { service, fake } = createService(context, { activeObjectiveId: 'objective-ielts' })
    const generated = await service.generate(USER_ID)
    const target = generated.data[0]!

    await service.submitFeedback(USER_ID, target.id, { action: 'ACCEPTED' })

    fake.setActiveObjectiveId('objective-toefl')

    await expect(service.apply(USER_ID, target.id, { confirm: true })).rejects.toBeInstanceOf(
      ConflictError,
    )
    expect(fake.goals).toHaveLength(0)
  })
})

describe('listing', () => {
  it('returns the stored batch and filters by status', async () => {
    const { service } = createService(MISSED_GOAL_CONTEXT)
    const generated = await service.generate(USER_ID)
    await service.submitFeedback(USER_ID, generated.data[0]!.id, { action: 'POSTPONED' })

    const all = await service.list(USER_ID, { limit: 20 })
    expect(all.data).toHaveLength(2)

    const postponed = await service.list(USER_ID, { status: 'POSTPONED', limit: 20 })
    expect(postponed.data).toHaveLength(1)
    expect(postponed.data[0]?.status).toBe('POSTPONED')
  })
})

describe('decision history', () => {
  it('keeps the decision, the reason and the wording it was taken on', async () => {
    const context = makeContext({
      lastPractised: {
        vocabulary: 2,
        grammar: 2,
        listening: 2,
        reading: 2,
        writing: 19,
        speaking: 2,
      },
    })
    const { service } = createService(context)
    const generated = await service.generate(USER_ID)
    const target = generated.data.find((item) => item.type === 'SKILL')!

    await service.submitFeedback(USER_ID, target.id, {
      action: 'REJECTED',
      reason: 'Not this week',
    })

    const history = await service.history(USER_ID, { limit: 10 })

    expect(history.meta).toEqual({ count: 1, limit: 10 })
    expect(history.data[0]).toMatchObject({
      recommendationId: target.id,
      action: 'REJECTED',
      reason: 'Not this week',
      title: target.title,
      recommendation: target.recommendation,
      rationale: target.rationale,
      relatedSkillId: SKILL_IDS.writing,
      relatedSkillName: 'Writing',
      status: 'REJECTED',
      appliedAt: null,
    })
  })

  it('records when a decision turned into planning data', async () => {
    const { service } = createService(MISSED_GOAL_CONTEXT)
    const generated = await service.generate(USER_ID)
    const target = generated.data[0]!

    await service.submitFeedback(USER_ID, target.id, { action: 'ACCEPTED' })
    await service.apply(USER_ID, target.id, { confirm: true })

    const history = await service.history(USER_ID, { limit: 10 })
    expect(history.data[0]).toMatchObject({
      recommendationId: target.id,
      action: 'ACCEPTED',
      appliedAt: '2026-03-15T12:00:00.000Z',
      appliedGoalId: 'goal-1',
    })
  })

  it('filters by action and keeps each decision separate', async () => {
    const { service } = createService(MISSED_GOAL_CONTEXT)
    const generated = await service.generate(USER_ID)
    const target = generated.data[0]!

    await service.submitFeedback(USER_ID, target.id, {
      action: 'REJECTED',
      reason: 'Too soon',
    })
    await service.submitFeedback(USER_ID, target.id, { action: 'POSTPONED' })

    const all = await service.history(USER_ID, { limit: 10 })
    expect(all.data).toHaveLength(2)

    const rejected = await service.history(USER_ID, { action: 'REJECTED', limit: 10 })
    expect(rejected.data).toHaveLength(1)
    expect(rejected.data[0]?.reason).toBe('Too soon')
  })

  it('is empty before any decision is taken', async () => {
    const { service } = createService(MISSED_GOAL_CONTEXT)
    await service.generate(USER_ID)

    const history = await service.history(USER_ID, { limit: 10 })
    expect(history.data).toEqual([])
  })
})
