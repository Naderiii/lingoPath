import type { PrismaClient } from '@prisma/client'
import type {
  ListPlansQuery,
  CreateLongTermPlan,
  UpdateLongTermPlan,
  CreatePlanMilestone,
  UpdatePlanMilestone,
} from '@lingopath/types'
import { keysetOrderBy, keysetWhere } from '../../shared/keyset-pagination.js'
import {
  addDaysToDayKey,
  getDayKey,
  getWeekdayIndex,
  isValidTimeZone,
} from '../../shared/timezone.js'

export function createPlanRepository(prisma: PrismaClient) {
  return {
    async getUserTimezone(userId: string): Promise<string> {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { timezone: true },
      })
      const stored = user?.timezone
      // An unusable stored zone must not reach `Intl` (it throws): fall back to UTC.
      return stored && isValidTimeZone(stored) ? stored : 'UTC'
    },

    async findMany(userId: string, query: ListPlansQuery) {
      const { cursor, limit, status } = query

      const cursorWhere = await keysetWhere({
        cursor,
        field: 'startDate',
        direction: 'desc',
        loadCursorValue: async () => {
          if (!cursor) return null
          const row = await prisma.longTermPlan.findFirst({
            where: { id: cursor, userId },
            select: { startDate: true },
          })
          return row?.startDate ?? null
        },
      })

      const plans = await prisma.longTermPlan.findMany({
        where: {
          userId,
          ...(status ? { status } : {}),
          ...(cursorWhere ?? {}),
        },
        include: {
          objective: true,
          exam: true,
          milestones: {
            orderBy: { ordering: 'asc' },
            include: { skill: true },
          },
        },
        orderBy: keysetOrderBy('startDate', 'desc'),
        take: limit + 1,
      })

      const hasMore = plans.length > limit
      const items = hasMore ? plans.slice(0, limit) : plans
      const nextCursor = hasMore && items.length > 0 ? (items[items.length - 1]?.id ?? null) : null

      return { items, nextCursor, hasMore }
    },

    findById(id: string, userId: string) {
      return prisma.longTermPlan.findFirst({
        where: { id, userId },
        include: {
          objective: true,
          exam: true,
          milestones: {
            orderBy: { ordering: 'asc' },
            include: { skill: true },
          },
        },
      })
    },

    create(userId: string, data: CreateLongTermPlan) {
      return prisma.longTermPlan.create({
        data: {
          userId,
          title: data.title,
          description: data.description ?? null,
          startDate: new Date(data.startDate),
          endDate: new Date(data.endDate),
          targetMinutes: data.targetMinutes,
          status: data.status,
          objectiveId: data.objectiveId ?? null,
          examId: data.examId ?? null,
        },
        include: {
          objective: true,
          exam: true,
          milestones: true,
        },
      })
    },

    update(id: string, _userId: string, data: UpdateLongTermPlan) {
      return prisma.longTermPlan.update({
        where: { id },
        data: {
          ...(data.title ? { title: data.title } : {}),
          ...(data.description !== undefined ? { description: data.description ?? null } : {}),
          ...(data.startDate ? { startDate: new Date(data.startDate) } : {}),
          ...(data.endDate ? { endDate: new Date(data.endDate) } : {}),
          ...(data.targetMinutes !== undefined ? { targetMinutes: data.targetMinutes } : {}),
          ...(data.status ? { status: data.status } : {}),
          ...(data.objectiveId !== undefined ? { objectiveId: data.objectiveId ?? null } : {}),
          ...(data.examId !== undefined ? { examId: data.examId ?? null } : {}),
        },
        include: {
          objective: true,
          exam: true,
          milestones: { orderBy: { ordering: 'asc' } },
        },
      })
    },

    delete(id: string, _userId: string) {
      return prisma.longTermPlan.delete({
        where: { id },
      })
    },

    // ─── Study Time Aggregation ───────────────────────────────────────────────

    /** Total actual study minutes for a plan (from StudySession source of truth) */
    async getActualMinutesForPlan(planId: string): Promise<number> {
      const result = await prisma.studySession.aggregate({
        where: {
          OR: [{ planId }, { milestone: { planId } }],
        },
        _sum: { durationMinutes: true },
      })
      return result._sum.durationMinutes ?? 0
    },

    /**
     * Actual study minutes grouped by milestone, plus the plan-linked minutes
     * that belong to no milestone of this plan.
     *
     * Prevents double-counting by prioritising direct `milestoneId` links, then
     * assigning plan sessions without a milestone tag by date range. Minutes that
     * match neither (legacy rows whose milestone was deleted or points at another
     * plan) are reported as unassigned instead of being silently dropped, so the
     * breakdown always adds up to the plan total.
     */
    async getActualMinutesByMilestone(planId: string): Promise<{
      milestones: Array<{ milestoneId: string; totalMinutes: number }>
      unassignedMinutes: number
    }> {
      const milestones = await prisma.planMilestone.findMany({
        where: { planId },
        select: { id: true, startDate: true, endDate: true },
        orderBy: { ordering: 'asc' },
      })

      const sessions = await prisma.studySession.findMany({
        where: {
          OR: [{ planId }, { milestone: { planId } }],
        },
        select: { id: true, milestoneId: true, durationMinutes: true, startedAt: true },
      })

      const map = new Map<string, number>()
      for (const m of milestones) {
        map.set(m.id, 0)
      }

      let unassignedMinutes = 0

      for (const s of sessions) {
        if (s.milestoneId && map.has(s.milestoneId)) {
          map.set(s.milestoneId, (map.get(s.milestoneId) ?? 0) + s.durationMinutes)
          continue
        }

        // Explicitly tagged to a milestone that is not part of this plan: never
        // re-attribute it by date (that would move history between milestones).
        if (s.milestoneId) {
          unassignedMinutes += s.durationMinutes
          continue
        }

        const match = milestones.find((m) => s.startedAt >= m.startDate && s.startedAt <= m.endDate)
        if (match) {
          map.set(match.id, (map.get(match.id) ?? 0) + s.durationMinutes)
        } else {
          unassignedMinutes += s.durationMinutes
        }
      }

      return {
        milestones: Array.from(map.entries()).map(([milestoneId, totalMinutes]) => ({
          milestoneId,
          totalMinutes,
        })),
        unassignedMinutes,
      }
    },

    /** Actual study minutes aggregated by week for a plan (user's local weeks) */
    async getWeeklyActualMinutes(
      planId: string,
      startDate: Date,
      endDate: Date,
      timeZone: string = 'UTC',
    ): Promise<Array<{ weekStart: string; totalMinutes: number }>> {
      const sessions = await prisma.studySession.findMany({
        where: {
          OR: [{ planId }, { milestone: { planId } }],
          startedAt: { gte: startDate, lte: endDate },
        },
        select: { startedAt: true, durationMinutes: true },
        orderBy: { startedAt: 'asc' },
      })

      const weekMap = new Map<string, number>()
      for (const s of sessions) {
        const dayKey = getDayKey(s.startedAt, timeZone)
        // Monday of that local week.
        const mondayKey = addDaysToDayKey(dayKey, -((getWeekdayIndex(dayKey) + 6) % 7))
        weekMap.set(mondayKey, (weekMap.get(mondayKey) ?? 0) + s.durationMinutes)
      }

      return Array.from(weekMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([weekStart, totalMinutes]) => ({ weekStart, totalMinutes }))
    },

    /** Actual study minutes aggregated by month for a plan (user's local months) */
    async getMonthlyActualMinutes(
      planId: string,
      startDate: Date,
      endDate: Date,
      timeZone: string = 'UTC',
    ): Promise<Array<{ month: string; totalMinutes: number }>> {
      const sessions = await prisma.studySession.findMany({
        where: {
          OR: [{ planId }, { milestone: { planId } }],
          startedAt: { gte: startDate, lte: endDate },
        },
        select: { startedAt: true, durationMinutes: true },
        orderBy: { startedAt: 'asc' },
      })

      const monthMap = new Map<string, number>()
      for (const s of sessions) {
        const key = getDayKey(s.startedAt, timeZone).slice(0, 7)
        monthMap.set(key, (monthMap.get(key) ?? 0) + s.durationMinutes)
      }

      return Array.from(monthMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, totalMinutes]) => ({ month, totalMinutes }))
    },

    // ─── Milestones ────────────────────────────────────────────────────────────

    findMilestonesByPlanId(planId: string) {
      return prisma.planMilestone.findMany({
        where: { planId },
        include: { skill: true },
        orderBy: { ordering: 'asc' },
      })
    },

    findMilestoneById(id: string) {
      return prisma.planMilestone.findUnique({
        where: { id },
        include: { plan: true, skill: true },
      })
    },

    createMilestone(planId: string, data: CreatePlanMilestone) {
      return prisma.planMilestone.create({
        data: {
          planId,
          title: data.title,
          description: data.description ?? null,
          startDate: new Date(data.startDate),
          endDate: new Date(data.endDate),
          targetMinutes: data.targetMinutes,
          skillId: data.skillId ?? null,
          status: data.status,
          ordering: data.ordering,
        },
        include: { skill: true },
      })
    },

    updateMilestone(id: string, data: UpdatePlanMilestone) {
      return prisma.planMilestone.update({
        where: { id },
        data: {
          ...(data.title ? { title: data.title } : {}),
          ...(data.description !== undefined ? { description: data.description ?? null } : {}),
          ...(data.startDate ? { startDate: new Date(data.startDate) } : {}),
          ...(data.endDate ? { endDate: new Date(data.endDate) } : {}),
          ...(data.targetMinutes !== undefined ? { targetMinutes: data.targetMinutes } : {}),
          ...(data.skillId !== undefined ? { skillId: data.skillId ?? null } : {}),
          ...(data.status ? { status: data.status } : {}),
          ...(data.ordering !== undefined ? { ordering: data.ordering } : {}),
        },
        include: { skill: true },
      })
    },

    deleteMilestone(id: string) {
      return prisma.planMilestone.delete({
        where: { id },
      })
    },
  }
}

export type PlanRepository = ReturnType<typeof createPlanRepository>
