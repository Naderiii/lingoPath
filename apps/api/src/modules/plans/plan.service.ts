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

/**
 * Validates milestone dates against plan boundaries and checks for milestone overlap.
 * Overlap policy: Milestones within the same plan represent sequential phases and cannot overlap.
 * Adjacent milestones sharing a boundary date are allowed.
 */
export function validateMilestoneDates(
  startDateStr: string,
  endDateStr: string,
  plan: {
    startDate: Date
    endDate: Date
    milestones?: Array<{
      id: string
      title: string
      startDate: Date
      endDate: Date
      status: string
    }>
  },
  currentMilestoneId?: string,
): void {
  validatePlanDates(startDateStr, endDateStr)

  const msStart = new Date(startDateStr)
  const msEnd = new Date(endDateStr)

  if (msStart < plan.startDate) {
    throw new ValidationError('Milestone startDate cannot be before plan startDate')
  }

  if (msEnd > plan.endDate) {
    throw new ValidationError('Milestone endDate cannot be after plan endDate')
  }

  if (plan.milestones) {
    for (const other of plan.milestones) {
      if (currentMilestoneId && other.id === currentMilestoneId) {
        continue
      }
      if (other.status === 'CANCELLED') {
        continue
      }

      const otherStart = new Date(other.startDate)
      const otherEnd = new Date(other.endDate)

      // Strict overlap: msStart < otherEnd && msEnd > otherStart
      if (msStart < otherEnd && msEnd > otherStart) {
        throw new ValidationError(
          `Milestone dates overlap with existing milestone "${other.title}"`,
        )
      }
    }
  }
}

/**
 * Compute remaining days dynamically from an end date using the user's timezone.
 * Handles month boundaries, year boundaries, leap years, midnight, and DST.
 * Never stores remainingDays as source of truth.
 */
export function computeRemainingDays(endDate: Date, now?: Date, timeZone: string = 'UTC'): number {
  const current = now ?? new Date()
  if (endDate.getTime() <= current.getTime()) {
    return 0
  }

  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    const nowParts = formatter.format(current).split('-').map(Number)
    const endParts = formatter.format(endDate).split('-').map(Number)

    const nowUtcMidnight = Date.UTC(nowParts[0]!, nowParts[1]! - 1, nowParts[2]!)
    const endUtcMidnight = Date.UTC(endParts[0]!, endParts[1]! - 1, endParts[2]!)

    const diffDays = Math.round((endUtcMidnight - nowUtcMidnight) / (1000 * 60 * 60 * 24))
    return Math.max(0, diffDays === 0 ? 1 : diffDays)
  } catch {
    const diffMs = endDate.getTime() - current.getTime()
    return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))
  }
}

/**
 * Compute elapsed days from start date in user's timezone.
 */
export function computeElapsedDays(startDate: Date, now?: Date, timeZone: string = 'UTC'): number {
  const current = now ?? new Date()
  if (current.getTime() <= startDate.getTime()) {
    return 0
  }

  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    const startParts = formatter.format(startDate).split('-').map(Number)
    const nowParts = formatter.format(current).split('-').map(Number)

    const startUtcMidnight = Date.UTC(startParts[0]!, startParts[1]! - 1, startParts[2]!)
    const nowUtcMidnight = Date.UTC(nowParts[0]!, nowParts[1]! - 1, nowParts[2]!)

    return Math.max(0, Math.round((nowUtcMidnight - startUtcMidnight) / (1000 * 60 * 60 * 24)))
  } catch {
    const diffMs = current.getTime() - startDate.getTime()
    return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
  }
}

/**
 * Compute total days of a plan in user's timezone.
 */
export function computeTotalDays(startDate: Date, endDate: Date, timeZone: string = 'UTC'): number {
  if (endDate.getTime() <= startDate.getTime()) {
    return 0
  }

  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    const startParts = formatter.format(startDate).split('-').map(Number)
    const endParts = formatter.format(endDate).split('-').map(Number)

    const startUtcMidnight = Date.UTC(startParts[0]!, startParts[1]! - 1, startParts[2]!)
    const endUtcMidnight = Date.UTC(endParts[0]!, endParts[1]! - 1, endParts[2]!)

    const diff = Math.round((endUtcMidnight - startUtcMidnight) / (1000 * 60 * 60 * 24))
    return Math.max(0, diff === 0 ? 1 : diff)
  } catch {
    const diffMs = endDate.getTime() - startDate.getTime()
    return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))
  }
}

/**
 * Compute time progress percentage.
 */
export function computeTimeProgressPercent(
  startDate: Date,
  endDate: Date,
  now?: Date,
  timeZone: string = 'UTC',
): number {
  const current = now ?? new Date()
  const total = computeTotalDays(startDate, endDate, timeZone)
  if (total <= 0) return 100
  const elapsed = computeElapsedDays(startDate, current, timeZone)
  const pct = (elapsed / total) * 100
  return Math.min(100, Math.max(0, Math.round(pct * 100) / 100))
}

/**
 * Format minutes as "Xh Ym".
 */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

export interface PlanProgress {
  totalDays: number
  elapsedDays: number
  remainingDays: number
  timeProgressPercent: number
  targetMinutes: number
  actualMinutes: number
  remainingMinutes: number
  studyProgressPercent: number
  targetFormatted: string
  actualFormatted: string
  remainingFormatted: string
  isOverTarget: boolean
}

export interface MilestoneProgress {
  milestoneId: string
  title: string
  description: string | null
  startDate: Date
  endDate: Date
  targetMinutes: number
  actualMinutes: number
  remainingMinutes: number
  progressPercent: number
  remainingDays: number
  status: string
  ordering: number
  isCurrent: boolean
  isNext: boolean
}

export type PlanWithDerived = NonNullable<Awaited<ReturnType<PlanRepository['findById']>>> & {
  remainingDays: number
}

export function createPlanService(repository: PlanRepository) {
  return {
    async listPlans(userId: string, query: ListPlansQuery) {
      const timezone = repository.getUserTimezone ? await repository.getUserTimezone(userId) : 'UTC'
      const result = await repository.findMany(userId, query)
      const planIds = result.items.map((p) => p.id)

      // Batch fetch actual minutes for all plans in the list
      const actualMinutesMap = new Map<string, number>()
      await Promise.all(
        planIds.map(async (id) => {
          const minutes = await repository.getActualMinutesForPlan(id)
          actualMinutesMap.set(id, minutes)
        }),
      )

      const itemsWithDerived = result.items.map((plan) => {
        const actualMinutes = actualMinutesMap.get(plan.id) ?? 0
        const studyProgressPercent =
          plan.targetMinutes > 0
            ? Math.min(100, Math.round((actualMinutes / plan.targetMinutes) * 10000) / 100)
            : 0

        return {
          ...plan,
          remainingDays: computeRemainingDays(plan.endDate, undefined, timezone),
          actualMinutes,
          studyProgressPercent,
        }
      })

      return {
        data: itemsWithDerived,
        meta: {
          nextCursor: result.nextCursor,
          hasMore: result.hasMore,
          limit: query.limit,
        },
      }
    },

    async getPlanById(id: string, userId: string): Promise<PlanWithDerived> {
      const plan = await repository.findById(id, userId)
      if (!plan) throw new NotFoundError('LongTermPlan', id)
      const timezone = repository.getUserTimezone ? await repository.getUserTimezone(userId) : 'UTC'
      return {
        ...plan,
        remainingDays: computeRemainingDays(plan.endDate, undefined, timezone),
      }
    },

    /**
     * Consolidated endpoint returning full plan detail with progress.
     * Progress is computed from actual StudySession data (source of truth).
     */
    async getPlanProgress(
      id: string,
      userId: string,
    ): Promise<{
      plan: PlanWithDerived
      progress: PlanProgress
      milestones: MilestoneProgress[]
      weeklyProgress: Array<{ weekStart: string; totalMinutes: number }>
      monthlyProgress: Array<{ month: string; totalMinutes: number }>
    }> {
      const plan = await repository.findById(id, userId)
      if (!plan) throw new NotFoundError('LongTermPlan', id)

      const now = new Date()
      const [timezone, actualMinutes, milestoneMinutes, weeklyProgress, monthlyProgress] =
        await Promise.all([
          repository.getUserTimezone ? repository.getUserTimezone(userId) : Promise.resolve('UTC'),
          repository.getActualMinutesForPlan(id),
          repository.getActualMinutesByMilestone(id),
          repository.getWeeklyActualMinutes(id, plan.startDate, plan.endDate),
          repository.getMonthlyActualMinutes(id, plan.startDate, plan.endDate),
        ])

      const milestoneActualMap = new Map<string, number>()
      for (const m of milestoneMinutes) {
        milestoneActualMap.set(m.milestoneId, m.totalMinutes)
      }

      const totalDays = computeTotalDays(plan.startDate, plan.endDate, timezone)
      const elapsedDays = computeElapsedDays(plan.startDate, now, timezone)
      const remainingDays = computeRemainingDays(plan.endDate, now, timezone)
      const timeProgressPercent = computeTimeProgressPercent(
        plan.startDate,
        plan.endDate,
        now,
        timezone,
      )
      const remainingMinutes = Math.max(0, plan.targetMinutes - actualMinutes)
      const studyProgressPercent =
        plan.targetMinutes > 0
          ? Math.min(100, Math.round((actualMinutes / plan.targetMinutes) * 10000) / 100)
          : 0

      const progress: PlanProgress = {
        totalDays,
        elapsedDays,
        remainingDays,
        timeProgressPercent,
        targetMinutes: plan.targetMinutes,
        actualMinutes,
        remainingMinutes,
        studyProgressPercent,
        targetFormatted: formatMinutes(plan.targetMinutes),
        actualFormatted: formatMinutes(actualMinutes),
        remainingFormatted: formatMinutes(remainingMinutes),
        isOverTarget: actualMinutes > plan.targetMinutes,
      }

      // Determine current and next milestones
      let foundCurrent = false
      const milestoneProgresses: MilestoneProgress[] = (plan.milestones ?? []).map((m) => {
        const mActual = milestoneActualMap.get(m.id) ?? 0
        const mRemaining = Math.max(0, m.targetMinutes - mActual)
        const mProgressPercent =
          m.targetMinutes > 0
            ? Math.min(100, Math.round((mActual / m.targetMinutes) * 10000) / 100)
            : 0
        const mRemainingDays = computeRemainingDays(m.endDate, now, timezone)

        const isCurrent =
          !foundCurrent && m.status === 'ACTIVE' && now >= m.startDate && now <= m.endDate
        const isNext = !foundCurrent && !isCurrent && m.status === 'ACTIVE' && now < m.startDate

        if (isCurrent) foundCurrent = true

        return {
          milestoneId: m.id,
          title: m.title,
          description: m.description,
          startDate: m.startDate,
          endDate: m.endDate,
          targetMinutes: m.targetMinutes,
          actualMinutes: mActual,
          remainingMinutes: mRemaining,
          progressPercent: mProgressPercent,
          remainingDays: mRemainingDays,
          status: m.status,
          ordering: m.ordering,
          isCurrent,
          isNext: isNext && !foundCurrent,
        }
      })

      // If we found a "current", mark the first "isNext" correctly
      let nextFound = false
      for (const mp of milestoneProgresses) {
        if (mp.isCurrent) continue
        if (!nextFound && mp.status === 'ACTIVE' && now < mp.startDate) {
          mp.isNext = true
          nextFound = true
        } else {
          mp.isNext = false
        }
      }

      const planWithDerived: PlanWithDerived = {
        ...plan,
        remainingDays,
      }

      return {
        plan: planWithDerived,
        progress,
        milestones: milestoneProgresses,
        weeklyProgress,
        monthlyProgress,
      }
    },

    async createPlan(userId: string, data: CreateLongTermPlan) {
      validatePlanDates(data.startDate, data.endDate)
      const timezone = repository.getUserTimezone ? await repository.getUserTimezone(userId) : 'UTC'
      const plan = await repository.create(userId, data)
      return {
        ...plan,
        remainingDays: computeRemainingDays(plan.endDate, undefined, timezone),
      }
    },

    async updatePlan(id: string, userId: string, data: UpdateLongTermPlan) {
      const existing = await repository.findById(id, userId)
      if (!existing) throw new NotFoundError('LongTermPlan', id)

      const startDate = data.startDate ?? existing.startDate.toISOString()
      const endDate = data.endDate ?? existing.endDate.toISOString()

      if (data.startDate ?? data.endDate) {
        validatePlanDates(startDate, endDate)

        const newPlanStart = new Date(startDate)
        const newPlanEnd = new Date(endDate)

        for (const m of existing.milestones ?? []) {
          if (m.status === 'CANCELLED') continue
          if (m.startDate < newPlanStart) {
            throw new ValidationError(
              `Plan startDate cannot be after existing milestone "${m.title}" start date`,
            )
          }
          if (m.endDate > newPlanEnd) {
            throw new ValidationError(
              `Plan endDate cannot be before existing milestone "${m.title}" end date`,
            )
          }
        }
      }

      const timezone = repository.getUserTimezone ? await repository.getUserTimezone(userId) : 'UTC'
      const plan = await repository.update(id, userId, data)
      return {
        ...plan,
        remainingDays: computeRemainingDays(plan.endDate, undefined, timezone),
      }
    },

    async deletePlan(id: string, userId: string) {
      const existing = await repository.findById(id, userId)
      if (!existing) throw new NotFoundError('LongTermPlan', id)
      await repository.delete(id, userId)
    },

    // ─── Milestones ────────────────────────────────────────────────────────────

    async listMilestones(planId: string, userId: string) {
      const plan = await repository.findById(planId, userId)
      if (!plan) throw new NotFoundError('LongTermPlan', planId)

      const [milestones, milestoneMinutes, timezone] = await Promise.all([
        repository.findMilestonesByPlanId(planId),
        repository.getActualMinutesByMilestone(planId),
        repository.getUserTimezone ? repository.getUserTimezone(userId) : Promise.resolve('UTC'),
      ])

      const actualMap = new Map<string, number>()
      for (const m of milestoneMinutes) {
        actualMap.set(m.milestoneId, m.totalMinutes)
      }

      return milestones.map((m) => {
        const actualMinutes = actualMap.get(m.id) ?? 0
        return {
          ...m,
          actualMinutes,
          remainingDays: computeRemainingDays(m.endDate, undefined, timezone),
          progressPercent:
            m.targetMinutes > 0
              ? Math.min(100, Math.round((actualMinutes / m.targetMinutes) * 10000) / 100)
              : 0,
        }
      })
    },

    async createMilestone(planId: string, userId: string, data: CreatePlanMilestone) {
      const plan = await repository.findById(planId, userId)
      if (!plan) throw new NotFoundError('LongTermPlan', planId)
      validateMilestoneDates(data.startDate, data.endDate, plan)
      return repository.createMilestone(planId, data)
    },

    async updateMilestone(id: string, userId: string, data: UpdatePlanMilestone) {
      const milestone = await repository.findMilestoneById(id)
      if (!milestone || milestone.plan.userId !== userId) {
        throw new NotFoundError('PlanMilestone', id)
      }

      const startDate = data.startDate ?? milestone.startDate.toISOString()
      const endDate = data.endDate ?? milestone.endDate.toISOString()

      if (data.startDate || data.endDate) {
        const plan = await repository.findById(milestone.planId, userId)
        if (plan) {
          validateMilestoneDates(startDate, endDate, plan, id)
        }
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
