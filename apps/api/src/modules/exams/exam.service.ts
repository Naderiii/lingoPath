import type { ExamRepository } from './exam.repository.js'
import type { ListExamsQuery, CreateExam, UpdateExam, CreateExamResult } from '@lingopath/types'
import { NotFoundError } from '../../shared/errors.js'

export function createExamService(repository: ExamRepository) {
  return {
    async listExams(userId: string, query: ListExamsQuery) {
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

    async getExamById(id: string, userId: string) {
      const exam = await repository.findById(id, userId)
      if (!exam) throw new NotFoundError('Exam', id)
      return exam
    },

    async createExam(userId: string, data: CreateExam) {
      return repository.create(userId, data)
    },

    async updateExam(id: string, userId: string, data: UpdateExam) {
      const existing = await repository.findById(id, userId)
      if (!existing) throw new NotFoundError('Exam', id)
      return repository.update(id, userId, data)
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
