import type { ObjectiveRepository } from './objective.repository.js'
import type {
  ActiveObjectiveContext,
  ActiveObjectiveExamSummary,
  CreateLearningObjective,
  LearningObjective,
  UpdateLearningObjective,
} from '@lingopath/types'
import { NotFoundError, ValidationError } from '../../shared/errors.js'
import { diffDayKeys, getDayKey } from '../../shared/timezone.js'
import { buildObjectiveSignals, type SignalObjective } from './objective.signals.js'

type ObjectiveRow = NonNullable<Awaited<ReturnType<ObjectiveRepository['findById']>>>
type AssessmentRow = NonNullable<Awaited<ReturnType<ObjectiveRepository['findLatestAssessment']>>>
type ResultRow = NonNullable<Awaited<ReturnType<ObjectiveRepository['findLatestResultForExamIds']>>>

/** JSON shape of an objective (dates as ISO strings), matching the contract. */
function serializeObjective(row: ObjectiveRow): LearningObjective {
  return {
    id: row.id,
    userId: row.userId,
    type: row.type,
    title: row.title,
    description: row.description,
    targetScore: row.targetScore,
    targetDate: row.targetDate ? row.targetDate.toISOString() : null,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/** Section scores are stored as JSON; only finite numbers survive the read. */
function toScoreMap(value: unknown): Record<string, number> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}

  const scores: Record<string, number> = {}
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === 'number' && Number.isFinite(raw)) scores[key] = raw
  }
  return scores
}

export function createObjectiveService(repository: ObjectiveRepository) {
  /**
   * The focus payload: the active objective plus everything derived from it.
   *
   * Every derived value comes from recorded data — a date or score the learner
   * entered, or the absence of one. Study time is deliberately absent from this
   * function: hours studied cannot move a level, a target or a signal.
   */
  async function buildContext(userId: string, timeZone: string): Promise<ActiveObjectiveContext> {
    const today = getDayKey(new Date(), timeZone)
    const objective = await repository.findActive(userId)

    if (!objective) {
      const total = await repository.countByUser(userId)
      return {
        objective: null,
        status: total > 0 ? 'NONE_SET' : 'NONE_CREATED',
        timezone: timeZone,
        today,
        daysUntilTargetDate: null,
        isTargetDatePassed: false,
        linkedPlanCount: 0,
        linkedGoalCount: 0,
        linkedExams: [],
        latestRecordedResult: null,
        latestAssessment: null,
        signals: buildObjectiveSignals({
          objective: null,
          hasAnyObjective: total > 0,
          today,
          daysUntilTargetDate: null,
          linkedPlanCount: 0,
          linkedGoalCount: 0,
          linkedExams: [],
          latestRecordedResult: null,
          hasAnyAssessment: false,
        }),
      }
    }

    const [linkedPlanCount, linkedGoalCount, exams, latestAssessment] = await Promise.all([
      repository.countLinkedPlans(objective.id, userId),
      repository.countLinkedGoals(objective.id, userId),
      repository.findLinkedExams(objective.id, userId),
      repository.findLatestAssessment(userId),
    ])

    const latestResult: ResultRow | null = await repository.findLatestResultForExamIds(
      exams.map((exam) => exam.id),
    )
    const resultExam = latestResult
      ? exams.find((exam) => exam.id === latestResult.examId)
      : undefined

    // Whole days in the learner's timezone, from the same day-key arithmetic the
    // calendar uses — never an hour difference that DST can shift by one.
    const targetDateKey = objective.targetDate ? getDayKey(objective.targetDate, timeZone) : null
    const daysUntilTargetDate = targetDateKey === null ? null : diffDayKeys(today, targetDateKey)

    const linkedExams: ActiveObjectiveExamSummary[] = exams.map((exam) => ({
      id: exam.id,
      title: exam.title,
      type: exam.type,
      status: exam.status,
      scheduledAt: exam.scheduledAt ? exam.scheduledAt.toISOString() : null,
      targetScore: exam.targetScore,
      targetDate: exam.targetDate ? exam.targetDate.toISOString() : null,
    }))

    const signalObjective: SignalObjective = {
      title: objective.title,
      type: objective.type,
      targetScore: objective.targetScore,
      targetDate: targetDateKey,
    }

    const latestRecordedResult =
      latestResult === null || resultExam === undefined
        ? null
        : {
            examId: latestResult.examId,
            examTitle: resultExam.title,
            takenAt: latestResult.takenAt.toISOString(),
            isMock: latestResult.isMock,
            overallScore: latestResult.overallScore,
            skillScores: toScoreMap(latestResult.skillScores),
          }

    return {
      objective: serializeObjective(objective),
      status: 'SET',
      timezone: timeZone,
      today,
      daysUntilTargetDate,
      isTargetDatePassed: daysUntilTargetDate !== null && daysUntilTargetDate < 0,
      linkedPlanCount,
      linkedGoalCount,
      linkedExams,
      latestRecordedResult,
      latestAssessment: latestAssessment === null ? null : serializeAssessment(latestAssessment),
      signals: buildObjectiveSignals({
        objective: signalObjective,
        hasAnyObjective: true,
        today,
        daysUntilTargetDate,
        linkedPlanCount,
        linkedGoalCount,
        linkedExams: exams.map((exam) => ({
          id: exam.id,
          title: exam.title,
          status: exam.status,
          targetScore: exam.targetScore,
        })),
        latestRecordedResult:
          latestResult === null || resultExam === undefined
            ? null
            : {
                examId: latestResult.examId,
                examTitle: resultExam.title,
                takenOn: getDayKey(latestResult.takenAt, timeZone),
                isMock: latestResult.isMock,
                overallScore: latestResult.overallScore,
              },
        hasAnyAssessment: latestAssessment !== null,
      }),
    }
  }

  function serializeAssessment(row: AssessmentRow) {
    return {
      id: row.id,
      assessedAt: row.assessedAt.toISOString(),
      method: row.method,
      cefrLevel: row.cefrLevel,
    }
  }

  return {
    buildContext,

    async getActiveObjective(userId: string, timeZone: string) {
      return buildContext(userId, timeZone)
    },

    /**
     * Sets or clears the active objective. Archived objectives are refused rather
     * than silently un-archived, so "which objective am I following" always matches
     * a live objective.
     */
    async setActiveObjective(userId: string, objectiveId: string | null, timeZone: string) {
      if (objectiveId !== null) {
        const objective = await repository.findById(objectiveId, userId)
        if (!objective) throw new NotFoundError('LearningObjective', objectiveId)

        if (!objective.isActive) {
          throw new ValidationError(
            `"${objective.title}" is inactive, so it cannot be the active objective. Activate it first.`,
          )
        }
      }

      const result = await repository.setActive(userId, objectiveId)
      if (result.count === 0) throw new NotFoundError('User', userId)

      return buildContext(userId, timeZone)
    },

    async listObjectives(userId: string) {
      return repository.findAll(userId)
    },

    async getObjectiveById(id: string, userId: string) {
      const objective = await repository.findById(id, userId)
      if (!objective) throw new NotFoundError('LearningObjective', id)
      return objective
    },

    async createObjective(userId: string, data: CreateLearningObjective) {
      return repository.create(userId, data)
    },

    async updateObjective(id: string, userId: string, data: UpdateLearningObjective) {
      const existing = await repository.findById(id, userId)
      if (!existing) throw new NotFoundError('LearningObjective', id)
      return repository.update(id, userId, data)
    },

    async deleteObjective(id: string, userId: string) {
      const existing = await repository.findById(id, userId)
      if (!existing) throw new NotFoundError('LearningObjective', id)
      await repository.delete(id, userId)
    },
  }
}

export type ObjectiveService = ReturnType<typeof createObjectiveService>
