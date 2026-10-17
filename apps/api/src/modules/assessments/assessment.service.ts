import type { AssessmentRepository, AssessmentWriteInput } from './assessment.repository.js'
import type {
  CreateLevelAssessment,
  LevelAssessmentEntry,
  LevelDimension,
  LevelOverviewResponse,
  ListLevelAssessmentsQuery,
  UpdateLevelAssessment,
} from '@lingopath/types'
import { NotFoundError, ValidationError } from '../../shared/errors.js'
import { getDayKey } from '../../shared/timezone.js'
import {
  LEVEL_DIMENSIONS,
  buildCurrentSnapshots,
  levelsOf,
  mergeLevels,
  rankByLevel,
  recordedDimensions,
  sortAssessmentsDesc,
} from './level.domain.js'

type AssessmentLevelRows = Awaited<ReturnType<AssessmentRepository['findAllLevels']>>
type AssessmentRow = AssessmentLevelRows[number]

/**
 * An assessment must record at least one of the five dimensions. Enforced here
 * rather than in the Zod schema so create and update share one rule and an update
 * is validated against the merged row.
 */
function assertRecordsALevel(dimensions: LevelDimension[]): void {
  if (dimensions.length === 0) {
    throw new ValidationError(
      'A level assessment must record at least one CEFR level (overall, listening, reading, writing or speaking).',
      { dimensions: [...LEVEL_DIMENSIONS] },
    )
  }
}

/**
 * JSON shape of one assessment. The overview is a *computed* payload, so it is
 * serialized explicitly here instead of leaning on the JSON encoder the plain
 * CRUD endpoints use — same wire format, no reliance on implicit Date coercion.
 */
function serializeAssessment(row: AssessmentRow): LevelAssessmentEntry {
  return {
    id: row.id,
    userId: row.userId,
    cefrLevel: row.cefrLevel,
    listeningLevel: row.listeningLevel,
    readingLevel: row.readingLevel,
    writingLevel: row.writingLevel,
    speakingLevel: row.speakingLevel,
    assessedAt: row.assessedAt.toISOString(),
    method: row.method,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    levels: levelsOf(row),
  }
}

export function createAssessmentService(repository: AssessmentRepository) {
  return {
    async listAssessments(userId: string, query: ListLevelAssessmentsQuery) {
      const result = await repository.findMany(userId, query)
      return {
        data: result.items,
        meta: {
          nextCursor: result.nextCursor,
          hasMore: result.hasMore,
          limit: query.limit,
        },
      }
    },

    async getAssessmentById(id: string, userId: string) {
      const assessment = await repository.findById(id, userId)
      if (!assessment) throw new NotFoundError('LevelAssessment', id)
      return assessment
    },

    async createAssessment(userId: string, data: CreateLevelAssessment) {
      assertRecordsALevel(recordedDimensions(data))
      return repository.create(userId, data)
    },

    /**
     * Partial update. The stored row is merged with the patch first, so `null`
     * clears a dimension and an omitted field leaves it alone — and the "at least
     * one dimension" rule is checked against what the row will actually look like,
     * which is the only way clearing the last level can be rejected.
     */
    async updateAssessment(id: string, userId: string, data: UpdateLevelAssessment) {
      const existing = await repository.findById(id, userId)
      if (!existing) throw new NotFoundError('LevelAssessment', id)

      const merged = mergeLevels(existing, data)
      assertRecordsALevel(recordedDimensions(merged))

      const write: AssessmentWriteInput = {
        ...merged,
        ...(data.assessedAt !== undefined ? { assessedAt: new Date(data.assessedAt) } : {}),
        ...(data.method !== undefined ? { method: data.method } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
      }

      return repository.update(id, userId, write)
    },

    /**
     * `/levels` payload: the most recently recorded level per dimension plus a page
     * of history, resolved in the user's timezone.
     *
     * Levels come only from assessments the learner recorded. Study time is not
     * consulted — deliberately — so a heavy week of studying cannot move a level,
     * and an empty history yields "not recorded" rather than an estimate.
     */
    async getLevelOverview(
      userId: string,
      query: ListLevelAssessmentsQuery,
      timeZone: string,
    ): Promise<LevelOverviewResponse> {
      const assessments = await repository.findAllLevels(userId)
      const ordered = sortAssessmentsDesc(assessments)
      const history = ordered.slice(0, query.limit)
      const hasMore = ordered.length > history.length
      const last = history[history.length - 1]

      return {
        basis: 'RECORDED_ASSESSMENTS',
        timezone: timeZone,
        today: getDayKey(new Date(), timeZone),
        dimensions: [...LEVEL_DIMENSIONS],
        rankByLevel: rankByLevel(),
        current: buildCurrentSnapshots(assessments),
        history: history.map(serializeAssessment),
        totalAssessments: ordered.length,
        hasMore,
        nextCursor: hasMore && last ? last.id : null,
        limit: query.limit,
      }
    },

    async deleteAssessment(id: string, userId: string) {
      const existing = await repository.findById(id, userId)
      if (!existing) throw new NotFoundError('LevelAssessment', id)
      await repository.delete(id, userId)
    },
  }
}

export type AssessmentService = ReturnType<typeof createAssessmentService>
