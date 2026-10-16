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

/**
 * One skill may carry at most one target per goal: the schema enforces it with
 * `@@unique([goalId, skillId])`, and a Prisma unique-constraint error would
 * surface as a 500 — reject duplicates as a 422 before touching the database.
 */
function validateSkillTargets(skillTargets: Array<{ skillId: string }> | undefined): void {
  if (!skillTargets) return

  const seen = new Set<string>()
  for (const target of skillTargets) {
    if (seen.has(target.skillId)) {
      throw new ValidationError(`Duplicate skill target for skill '${target.skillId}'`)
    }
    seen.add(target.skillId)
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

    async getGoalWithProgress(id: string, userId: string, timeZone: string = 'UTC') {
      const goal = await repository.findById(id, userId)
      if (!goal) throw new NotFoundError('Goal', id)

      const progress = await repository.calculateProgress(id, userId, timeZone)
      return { ...goal, progress }
    },

    async listGoalsWithProgress(userId: string, query: ListGoalsQuery, timeZone: string = 'UTC') {
      const result = await repository.findMany(userId, query)

      const goalsWithProgress = await Promise.all(
        result.items.map(async (goal) => {
          const progress = await repository.calculateProgress(goal.id, userId, timeZone)
          return { ...goal, progress }
        }),
      )

      return {
        data: goalsWithProgress,
        meta: {
          nextCursor: result.nextCursor,
          hasMore: result.hasMore,
          limit: query.limit,
        },
      }
    },

    async createGoal(userId: string, data: CreateGoal) {
      validateGoalDates(data.startDate, data.endDate)
      validateSkillTargets(data.skillTargets)
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
      validateSkillTargets(data.skillTargets)

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
