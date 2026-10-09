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

    // ─── Milestones ────────────────────────────────────────────────────────────

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
