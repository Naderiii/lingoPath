import type { ExamRepository } from './exam.repository.js'
import type {
  CreateExam,
  CreateExamResult,
  ExamType,
  ListExamsQuery,
  UpdateExam,
} from '@lingopath/types'
import { NotFoundError, ValidationError } from '../../shared/errors.js'
import { SCORE_SCALE_DEFAULTS, SCORE_SCALE_PRESETS, resolveScoreScale, validateExamScores } from './exam.scoring.js'

/**
 * Attaches the exam's effective scoring scale.
 *
 * An unusable stored descriptor throws instead of being ignored: this API is the
 * only writer and resolves the descriptor on write, so a value that no longer
 * resolves means the row was changed outside the application — and reading scores
 * against no scale would quietly make them meaningless.
 */
function withScale<T extends { type: ExamType; scoreScale: unknown }>(exam: T) {
  const { scale, source } = resolveScoreScale({ type: exam.type, stored: exam.scoreScale })
  return { ...exam, scale, scaleSource: source }
}

/** The built-in scales a client can pick from, plus each type's default. */
function listScales() {
  return { data: SCORE_SCALE_PRESETS, defaults: SCORE_SCALE_DEFAULTS }
}

export function createExamService(repository: ExamRepository) {
  return {
    async listExams(userId: string, query: ListExamsQuery) {
      const result = await repository.findMany(userId, query)
      return {
        data: result.items.map(withScale),
        meta: {
          nextCursor: result.nextCursor,
          hasMore: result.hasMore,
          limit: query.limit,
        },
      }
    },

    async getExamById(id: string, userId: string) {
      const exam = await repository.findById(id, userId)
      if (!exam) throw new NotFoundError('Exam', id)
      return withScale(exam)
    },

    listScales,

    async createExam(userId: string, data: CreateExam) {
      // Resolved before it is stored, so an unusable descriptor is rejected at the
      // boundary rather than on every later read.
      if (data.scoreScale !== undefined) {
        resolveScoreScale({ type: data.type, stored: data.scoreScale })
      }

      return withScale(await repository.create(userId, data))
    },

    async updateExam(id: string, userId: string, data: UpdateExam) {
      const existing = await repository.findById(id, userId)
      if (!existing) throw new NotFoundError('Exam', id)

      if (data.scoreScale !== undefined && data.scoreScale !== null) {
        resolveScoreScale({ type: data.type ?? existing.type, stored: data.scoreScale })
      }

      return withScale(await repository.update(id, userId, data))
    },

    async deleteExam(id: string, userId: string) {
      const existing = await repository.findById(id, userId)
      if (!existing) throw new NotFoundError('Exam', id)
      await repository.delete(id, userId)
    },

    // ─── Exam Results ──────────────────────────────────────────────────────────

    async addExamResult(examId: string, userId: string, data: CreateExamResult) {
      const exam = await repository.findById(examId, userId)
      if (!exam) throw new NotFoundError('Exam', examId)

      // Scores are checked against this exam's own scale: an IELTS band of 9.5 is
      // rejected because the band scale tops out at 9, while a TOEFL total of 110
      // is accepted because the total scale reaches 120.
      const { scale } = resolveScoreScale({ type: exam.type, stored: exam.scoreScale })
      const issues = validateExamScores(scale, {
        ...(data.overallScore !== undefined ? { overallScore: data.overallScore } : {}),
        ...(data.skillScores !== undefined ? { skillScores: data.skillScores } : {}),
      })

      if (issues.length > 0) {
        // The first issue leads the message so a client showing `error.message`
        // still learns what to fix; every issue travels in `details`.
        const [first] = issues
        throw new ValidationError(
          first?.message ?? `Recorded scores do not fit the ${scale?.label ?? 'exam'} scale.`,
          { scale: scale?.key ?? null, issues },
        )
      }

      return repository.createResult(examId, data)
    },

    async getExamResults(examId: string, userId: string) {
      const exam = await repository.findById(examId, userId)
      if (!exam) throw new NotFoundError('Exam', examId)
      return repository.findResultsByExamId(examId)
    },
  }
}

export type ExamService = ReturnType<typeof createExamService>
