import type { GoalRepository } from './goal.repository.js'
import type { ListGoalsQuery, CreateGoal, UpdateGoal } from '@lingopath/types'
import { NotFoundError, ValidationError } from '../../shared/errors.js'

function validateGoalDates(startDateStr: string, endDateStr?: string | null): void {
  const start = new Date(startDateStr)
  if (isNaN(start.getTime())) {
    throw new ValidationError('startDate must be a valid date')
  }

  if (endDateStr) {
    const end = new Date(endDateStr)
    if (isNaN(end.getTime())) {
      throw new ValidationError('endDate must be a valid date')
    }
    if (end <= start) {
      throw new ValidationError('endDate must be after startDate')
    }
  }
}

export function createGoalService(repository: GoalRepository) {
  return {
    async listGoals(userId: string, query: ListGoalsQuery) {
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

    async getGoalById(id: string, userId: string) {
      const goal = await repository.findById(id, userId)
      if (!goal) throw new NotFoundError('Goal', id)
      return goal
    },

    async createGoal(userId: string, data: CreateGoal) {
      validateGoalDates(data.startDate, data.endDate)
      return repository.create(userId, data)
    },

    async updateGoal(id: string, userId: string, data: UpdateGoal) {
      const existing = await repository.findById(id, userId)
      if (!existing) throw new NotFoundError('Goal', id)

      const startDate = data.startDate ?? existing.startDate.toISOString()
      const endDate =
        data.endDate !== undefined ? data.endDate : (existing.endDate?.toISOString() ?? undefined)

      if (data.startDate ?? data.endDate) {
        validateGoalDates(startDate, endDate)
      }

      return repository.update(id, userId, data)
    },

    async deleteGoal(id: string, userId: string) {
      const existing = await repository.findById(id, userId)
      if (!existing) throw new NotFoundError('Goal', id)
      await repository.delete(id, userId)
    },
  }
}

export type GoalService = ReturnType<typeof createGoalService>
