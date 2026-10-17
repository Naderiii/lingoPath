/**
 * Recommendation service — the use-case layer (Phase 10).
 *
 * It owns the sequence the phase is specified around:
 *
 * ```
 * Data Aggregation → Analysis → Recommendation → User Decision → Optional Action
 * ```
 *
 * and it enforces the boundary between the last two steps in code rather than in
 * documentation. `submitFeedback` records what the learner decided and *nothing
 * else*: no goal changes, no plan edits, no sessions created. `apply` is a
 * separate call, requires an explicit `confirm: true` and a prior acceptance, and
 * is the only place in the module that writes to planning data.
 *
 * Everything the service returns is a stored row — generation persists before it
 * answers — so the learner's decision later refers to text that cannot shift under
 * them when new sessions arrive.
 */

import { z } from 'zod'
import type {
  ApplyRecommendation,
  Recommendation,
  RecommendationAction,
  RecommendationDataPoint,
  RecommendationFollowUp,
  RecommendationGeneration,
  RecommendationStatus,
  SuggestedGoalAction,
} from '@lingopath/types'
import { RecommendationDataPointSchema, SuggestedGoalActionSchema } from '@lingopath/types'
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors.js'
import { generateRecommendations } from './recommendation.engine.js'
import type { LlmAdapter } from './recommendation.llm.js'
import type { RecommendationAggregation } from './recommendation.aggregation.js'
import type { RecommendationRepository } from './recommendation.repository.js'

/** A generated batch stays answerable for a week before it is retired. */
export const RECOMMENDATION_FRESHNESS_HOURS = 24 * 7

const SupportingDataSchema = z.array(RecommendationDataPointSchema)

type RecommendationRow = NonNullable<Awaited<ReturnType<RecommendationRepository['findById']>>>

export interface RecommendationServiceDeps {
  aggregation: RecommendationAggregation
  repository: RecommendationRepository
  llm: LlmAdapter
  now?: () => Date
  maxCandidates?: number
}

export interface RecommendationListMeta {
  count: number
  limit: number
}

const STATUS_FOR_ACTION: Record<RecommendationAction, RecommendationStatus> = {
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  MODIFIED: 'MODIFIED',
  POSTPONED: 'POSTPONED',
  IGNORED: 'IGNORED',
}

/** Statuses a decision may still be taken on. */
const ANSWERABLE: ReadonlySet<RecommendationStatus> = new Set<RecommendationStatus>([
  'NEW',
  'ACCEPTED',
  'MODIFIED',
  'POSTPONED',
  'REJECTED',
  'IGNORED',
])

/** Statuses that count as the learner having said yes. */
const ACCEPTED_STATUSES: ReadonlySet<RecommendationStatus> = new Set<RecommendationStatus>([
  'ACCEPTED',
  'MODIFIED',
])

function parseSupportingData(value: unknown): RecommendationDataPoint[] {
  const parsed = SupportingDataSchema.safeParse(value)
  return parsed.success ? parsed.data : []
}

function parseSuggestedAction(value: unknown): SuggestedGoalAction | null {
  if (value === null || value === undefined) return null
  const parsed = SuggestedGoalActionSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

export function createRecommendationService(deps: RecommendationServiceDeps) {
  const now = deps.now ?? ((): Date => new Date())

  function toDto(row: RecommendationRow, skillName: string | null): Recommendation {
    return {
      id: row.id,
      type: row.type,
      title: row.title,
      recommendation: row.recommendation,
      rationale: row.rationale,
      supportingData: parseSupportingData(row.supportingData),
      confidence: row.confidence,
      confidenceBasis: confidenceBasis(row, skillName),
      estimatedDurationMinutes: row.estimatedDurationMinutes,
      relatedSkillId: row.relatedSkillId,
      relatedSkillName: skillName,
      relatedGoalId: row.relatedGoalId,
      relatedPlanId: row.relatedPlanId,
      generatedAt: row.generatedAt.toISOString(),
      status: row.status,
      source: row.source,
      decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
      appliedAt: row.appliedAt ? row.appliedAt.toISOString() : null,
      appliedGoalId: row.appliedGoalId,
      expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
      suggestedAction: parseSuggestedAction(row.suggestedAction),
    }
  }

  async function withSkillNames(rows: readonly RecommendationRow[]): Promise<Recommendation[]> {
    const ids = [
      ...new Set(rows.flatMap((row) => (row.relatedSkillId ? [row.relatedSkillId] : []))),
    ]
    const names = await deps.repository.getSkillNames(ids)
    const byId = new Map(names.map((entry) => [entry.id, entry.name]))
    return rows.map((row) =>
      toDto(row, row.relatedSkillId ? (byId.get(row.relatedSkillId) ?? null) : null),
    )
  }

  return {
    /**
     * Generates and stores a batch.
     *
     * The previous open batch is retired first: recommendations are statements
     * about the evidence at a point in time, and two live batches would leave the
     * learner answering two versions of the same observation.
     */
    async generate(userId: string): Promise<{
      data: Recommendation[]
      meta: RecommendationGeneration
    }> {
      const startedAt = now()
      const context = await deps.aggregation.buildContext(userId)
      const result = await generateRecommendations(context, {
        llm: deps.llm,
        ...(deps.maxCandidates !== undefined ? { maxCandidates: deps.maxCandidates } : {}),
      })

      await deps.repository.expireStale(userId, startedAt)
      await deps.repository.supersedeOpen(userId)

      const expiresAt = new Date(startedAt.getTime() + RECOMMENDATION_FRESHNESS_HOURS * 3_600_000)

      const rows = await deps.repository.createMany(
        userId,
        result.recommendations.map((recommendation) => ({
          type: recommendation.type,
          title: recommendation.title,
          recommendation: recommendation.recommendation,
          rationale: recommendation.rationale,
          supportingData: recommendation.supportingData,
          confidence: recommendation.confidence,
          estimatedDurationMinutes: recommendation.estimatedDurationMinutes,
          relatedSkillId: recommendation.relatedSkillId,
          relatedGoalId: recommendation.relatedGoalId,
          relatedPlanId: recommendation.relatedPlanId,
          objectiveId: context.objective?.id ?? null,
          objectiveType: context.objective?.type ?? null,
          source: recommendation.source,
          evidenceKey: recommendation.evidenceKey,
          suggestedAction: recommendation.suggestedAction,
          generatedAt: startedAt,
          expiresAt,
        })),
      )

      const data = await withSkillNames(rows)
      const source = data.some((item) => item.source === 'LLM') ? 'LLM' : 'RULE_BASED'

      return {
        data,
        meta: {
          generatedAt: startedAt.toISOString(),
          objectiveId: context.objective?.id ?? null,
          objectiveType: context.objective?.type ?? null,
          source,
          llm: {
            attempted: result.llm.attempted,
            available: result.llm.available,
            reason: result.llm.reason,
          },
          confidenceCeiling: result.analysis.confidenceCeiling,
          dataQuality: result.analysis.dataQuality,
          considered: result.considered,
          suppressed: result.suppressed.length,
          rejectedByValidation: result.rejectedByValidation,
          notes: [
            result.analysis.ceilingRationale,
            ...result.analysis.dataQuality.notes,
            ...result.suppressed.map((entry) =>
              entry.reason === 'REPEATED_REJECTION'
                ? 'A recommendation you rejected is not repeated while its evidence is unchanged.'
                : 'A recommendation you postponed is held back until the postponement window ends.',
            ),
          ].filter((note, index, all) => all.indexOf(note) === index),
        },
      }
    },

    async list(
      userId: string,
      query: {
        status?: RecommendationStatus | undefined
        type?: Recommendation['type'] | undefined
        limit: number
      },
    ): Promise<{ data: Recommendation[]; meta: RecommendationListMeta }> {
      // Reading expires anything that aged out, so a stale NEW row can never be
      // presented as still open.
      await deps.repository.expireStale(userId, now())

      const rows = await deps.repository.findMany(userId, {
        limit: query.limit,
        ...(query.status !== undefined ? { status: query.status } : {}),
        ...(query.type !== undefined ? { type: query.type } : {}),
      })

      return {
        data: await withSkillNames(rows),
        meta: { count: rows.length, limit: query.limit },
      }
    },

    async getById(userId: string, id: string): Promise<Recommendation> {
      const row = await deps.repository.findById(id, userId)
      if (row === null) throw new NotFoundError('Recommendation', id)
      const [dto] = await withSkillNames([row])
      if (dto === undefined) throw new NotFoundError('Recommendation', id)
      return dto
    },

    /**
     * Records the learner's decision. This is the *only* effect.
     *
     * When the answer is yes, the response carries the follow-up question — "add
     * this to your plan?" — together with the concrete action that would be taken.
     * Nothing is written to the plan here.
     */
    async submitFeedback(
      userId: string,
      id: string,
      input: { action: RecommendationAction; reason?: string | undefined },
    ): Promise<{ data: Recommendation; meta: { followUp: RecommendationFollowUp | null } }> {
      const row = await deps.repository.findById(id, userId)
      if (row === null) throw new NotFoundError('Recommendation', id)

      if (!ANSWERABLE.has(row.status)) {
        throw new ConflictError(
          `This recommendation is ${row.status.toLowerCase()} and can no longer be answered. Generate a new batch to act on current evidence.`,
        )
      }

      const decidedAt = now()
      const { recommendation } = await deps.repository.recordDecision({
        recommendationId: id,
        userId,
        action: input.action,
        status: STATUS_FOR_ACTION[input.action],
        reason: input.reason !== undefined ? input.reason : null,
        at: decidedAt,
      })

      if (recommendation === null) throw new NotFoundError('Recommendation', id)

      const [dto] = await withSkillNames([recommendation])
      if (dto === undefined) throw new NotFoundError('Recommendation', id)

      const followUp: RecommendationFollowUp | null =
        input.action === 'ACCEPTED' || input.action === 'MODIFIED'
          ? {
              question: 'Add this to your plan?',
              canApply: dto.suggestedAction !== null,
              action: dto.suggestedAction,
            }
          : null

      return { data: dto, meta: { followUp } }
    },

    /**
     * The optional action: writes one goal, and only after an explicit
     * confirmation.
     *
     * Guards, in order: the recommendation must exist, must have been accepted,
     * must not have been applied already, and must still belong to the active
     * objective. Only then is a goal created — never a session, never a milestone,
     * never a plan edit.
     */
    async apply(
      userId: string,
      id: string,
      input: ApplyRecommendation,
    ): Promise<{ data: Recommendation; meta: { goalId: string } }> {
      const row = await deps.repository.findById(id, userId)
      if (row === null) throw new NotFoundError('Recommendation', id)

      if (!ACCEPTED_STATUSES.has(row.status)) {
        throw new ConflictError(
          'Accept the recommendation before adding it to your plan — accepting and applying are separate decisions.',
        )
      }

      if (row.appliedAt !== null) {
        throw new ConflictError(
          `This recommendation was already added to your plan${row.appliedGoalId ? ` as goal ${row.appliedGoalId}` : ''}.`,
        )
      }

      const user = await deps.repository.findUser(userId)
      const activeObjectiveId = user?.activeObjective?.id ?? null
      if ((row.objectiveId ?? null) !== activeObjectiveId) {
        throw new ConflictError(
          'The active objective changed after this recommendation was generated. Generate a new batch before applying it.',
        )
      }

      const proposal = parseSuggestedAction(row.suggestedAction)

      const period = input.period ?? proposal?.period ?? 'WEEKLY'
      const targetMinutes = input.targetMinutes ?? proposal?.targetMinutes ?? null
      const skillId = input.skillId !== undefined ? input.skillId : (proposal?.skillId ?? null)

      if (targetMinutes === null) {
        throw new ValidationError(
          'This recommendation carries no suggested target; supply `targetMinutes` and `period` explicitly to add it to your plan.',
        )
      }

      const goal = await deps.repository.goalRepository.create(userId, {
        period,
        targetMinutes,
        startDate: input.startDate ?? now().toISOString(),
        isActive: true,
        ...(row.objectiveId !== null ? { objectiveId: row.objectiveId } : {}),
        ...(skillId !== null ? { skillTargets: [{ skillId, targetMinutes }] } : {}),
      })

      await deps.repository.markApplied({
        recommendationId: id,
        userId,
        goalId: goal.id,
        at: now(),
      })

      const updated = await deps.repository.findById(id, userId)
      if (updated === null) throw new NotFoundError('Recommendation', id)

      const [dto] = await withSkillNames([updated])
      if (dto === undefined) throw new NotFoundError('Recommendation', id)

      return { data: dto, meta: { goalId: goal.id } }
    },
  }
}

/**
 * Restates, in the payload, what a confidence band is and is not.
 *
 * The band is stored, but the sentence explaining it is derived from the stored
 * values so it always matches the numbers next to it.
 */
function confidenceBasis(row: RecommendationRow, skillName: string | null): string {
  const subject =
    skillName === null ? 'your recorded study activity' : `your recorded ${skillName} activity`
  switch (row.confidence) {
    case 'LOW':
      return `LOW: ${subject} is thin or the observation rests on a single signal. A coarse band derived from how much evidence exists, not a probability.`
    case 'MEDIUM':
      return `MEDIUM: ${subject} shows a clear pattern across the recorded window, but not enough history for a high band. A coarse band, not a probability.`
    case 'HIGH':
      return `HIGH: ${subject} covers enough sessions and active days to state this plainly. Still a coarse band, not a probability.`
    default:
      return 'A coarse band derived from how much evidence exists, not a probability.'
  }
}

export type RecommendationService = ReturnType<typeof createRecommendationService>
