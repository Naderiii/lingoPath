import type { ObjectiveRepository } from './objective.repository.js'
import type { CreateLearningObjective, UpdateLearningObjective } from '@lingopath/types'
import { NotFoundError } from '../../shared/errors.js'

export function createObjectiveService(repository: ObjectiveRepository) {
  return {
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
