import type { PrismaClient } from '@prisma/client'
import type {
  ListPlansQuery,
  CreateLongTermPlan,
  UpdateLongTermPlan,
  CreatePlanMilestone,
  UpdatePlanMilestone,
} from '@lingopath/types'

export function createPlanRepository(prisma: PrismaClient) {
  return {
    async getUserTimezone(userId: string): Promise<string> {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { timezone: true },
      })
      return user?.timezone ?? 'UTC'
    },

    async findMany(userId: string, query: ListPlansQuery) {
      const { cursor, limit, status } = query

      const plans = await prisma.longTermPlan.findMany({
        where: {
          userId,
          ...(status ? { status } : {}),
          ...(cursor ? { id: { lt: cursor } } : {}),
        },
        include: {
          objective: true,
          exam: true,
          milestones: {
            orderBy: { ordering: 'asc' },
            include: { skill: true },
          },
        },
        orderBy: { startDate: 'desc' },
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
     * Actual study minutes grouped by milestone.
     * Prevents double-counting by prioritizing direct milestoneId links,
     * then assigning plan sessions without a milestone tag by date range.
     */
    async getActualMinutesByMilestone(
      planId: string,
    ): Promise<Array<{ milestoneId: string; totalMinutes: number }>> {
      const milestones = await prisma.planMilestone.findMany({
        where: { planId },
        select: { id: true, startDate: true, endDate: true },
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

      for (const s of sessions) {
        if (s.milestoneId && map.has(s.milestoneId)) {
          map.set(s.milestoneId, (map.get(s.milestoneId) ?? 0) + s.durationMinutes)
        } else if (!s.milestoneId) {
          for (const m of milestones) {
            if (s.startedAt >= m.startDate && s.startedAt <= m.endDate) {
              map.set(m.id, (map.get(m.id) ?? 0) + s.durationMinutes)
              break // Milestone ranges do not overlap; attribute at most once
            }
          }
        }
      }

      return Array.from(map.entries()).map(([milestoneId, totalMinutes]) => ({
        milestoneId,
        totalMinutes,
      }))
    },

    /** Actual study minutes aggregated by week for a plan */
    async getWeeklyActualMinutes(
      planId: string,
      startDate: Date,
      endDate: Date,
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
        const d = new Date(s.startedAt)
        // Get Monday of that week in UTC
        const day = d.getUTCDay()
        const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1)
        const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff))
        const key = monday.toISOString().slice(0, 10)
        weekMap.set(key, (weekMap.get(key) ?? 0) + s.durationMinutes)
      }

      return Array.from(weekMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([weekStart, totalMinutes]) => ({ weekStart, totalMinutes }))
    },

    /** Actual study minutes aggregated by month for a plan */
    async getMonthlyActualMinutes(
      planId: string,
      startDate: Date,
      endDate: Date,
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
        const d = new Date(s.startedAt)
        const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
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
