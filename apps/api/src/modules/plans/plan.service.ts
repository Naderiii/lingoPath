import type { PlanRepository } from './plan.repository.js'
import type {
  ListPlansQuery,
  CreateLongTermPlan,
  UpdateLongTermPlan,
  CreatePlanMilestone,
  UpdatePlanMilestone,
} from '@lingopath/types'
import { NotFoundError, ValidationError } from '../../shared/errors.js'

function validatePlanDates(startDateStr: string, endDateStr: string): void {
  const start = new Date(startDateStr)
  const end = new Date(endDateStr)

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new ValidationError('startDate and endDate must be valid dates')
  }

  if (end <= start) {
    throw new ValidationError('endDate must be strictly after startDate')
  }
}

export function computeRemainingDays(endDate: Date): number {
  const now = new Date()
  const diffMs = endDate.getTime() - now.getTime()
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))
}

export function createPlanService(repository: PlanRepository) {
  return {
    async listPlans(userId: string, query: ListPlansQuery) {
      const result = await repository.findMany(userId, query)
      const itemsWithDerived = result.items.map((plan) => ({
        ...plan,
        remainingDays: computeRemainingDays(plan.endDate),
      }))

      return {
        data: itemsWithDerived,
        meta: {
          nextCursor: result.nextCursor,
          hasMore: result.hasMore,
          limit: query.limit,
        },
      }
    },

    async getPlanById(id: string, userId: string) {
      const plan = await repository.findById(id, userId)
      if (!plan) throw new NotFoundError('LongTermPlan', id)
      return {
        ...plan,
        remainingDays: computeRemainingDays(plan.endDate),
      }
    },

    async createPlan(userId: string, data: CreateLongTermPlan) {
      validatePlanDates(data.startDate, data.endDate)
      const plan = await repository.create(userId, data)
      return {
        ...plan,
        remainingDays: computeRemainingDays(plan.endDate),
      }
    },

    async updatePlan(id: string, userId: string, data: UpdateLongTermPlan) {
      const existing = await repository.findById(id, userId)
      if (!existing) throw new NotFoundError('LongTermPlan', id)

      const startDate = data.startDate ?? existing.startDate.toISOString()
      const endDate = data.endDate ?? existing.endDate.toISOString()

      if (data.startDate ?? data.endDate) {
        validatePlanDates(startDate, endDate)
      }

      const plan = await repository.update(id, userId, data)
      return {
        ...plan,
        remainingDays: computeRemainingDays(plan.endDate),
      }
    },

    async deletePlan(id: string, userId: string) {
      const existing = await repository.findById(id, userId)
      if (!existing) throw new NotFoundError('LongTermPlan', id)
      await repository.delete(id, userId)
    },

    // ─── Milestones ────────────────────────────────────────────────────────────

    async createMilestone(planId: string, userId: string, data: CreatePlanMilestone) {
      const plan = await repository.findById(planId, userId)
      if (!plan) throw new NotFoundError('LongTermPlan', planId)
      validatePlanDates(data.startDate, data.endDate)
      return repository.createMilestone(planId, data)
    },

    async updateMilestone(id: string, userId: string, data: UpdatePlanMilestone) {
      const milestone = await repository.findMilestoneById(id)
      if (!milestone || milestone.plan.userId !== userId) {
        throw new NotFoundError('PlanMilestone', id)
      }

      const startDate = data.startDate ?? milestone.startDate.toISOString()
      const endDate = data.endDate ?? milestone.endDate.toISOString()

      if (data.startDate ?? data.endDate) {
        validatePlanDates(startDate, endDate)
      }

      return repository.updateMilestone(id, data)
    },

    async deleteMilestone(id: string, userId: string) {
      const milestone = await repository.findMilestoneById(id)
      if (!milestone || milestone.plan.userId !== userId) {
        throw new NotFoundError('PlanMilestone', id)
      }
      await repository.deleteMilestone(id)
    },
  }
}

export type PlanService = ReturnType<typeof createPlanService>
