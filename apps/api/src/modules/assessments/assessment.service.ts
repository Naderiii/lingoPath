import type { AssessmentRepository } from './assessment.repository.js'
import type { ListLevelAssessmentsQuery, CreateLevelAssessment } from '@lingopath/types'
import { NotFoundError } from '../../shared/errors.js'

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
      return repository.create(userId, data)
    },

    async deleteAssessment(id: string, userId: string) {
      const existing = await repository.findById(id, userId)
      if (!existing) throw new NotFoundError('LevelAssessment', id)
      await repository.delete(id, userId)
    },
  }
}

export type AssessmentService = ReturnType<typeof createAssessmentService>
