import type { PrismaClient, Prisma } from '@prisma/client'
import type { ListGoalsQuery, CreateGoal, UpdateGoal } from '@lingopath/types'

export function createGoalRepository(prisma: PrismaClient) {
  return {
    async findMany(userId: string, query: ListGoalsQuery) {
      const { cursor, limit, period, isActive } = query

      const goals = await prisma.goal.findMany({
        where: {
          userId,
          ...(period ? { period } : {}),
          ...(isActive !== undefined ? { isActive } : {}),
          ...(cursor ? { id: { lt: cursor } } : {}),
        },
        include: {
          plan: true,
          objective: true,
          skillTargets: { include: { skill: true } },
        },
        orderBy: { startDate: 'desc' },
        take: limit + 1,
      })

      const hasMore = goals.length > limit
      const items = hasMore ? goals.slice(0, limit) : goals
      const nextCursor = hasMore && items.length > 0 ? (items[items.length - 1]?.id ?? null) : null

      return { items, nextCursor, hasMore }
    },

    findById(id: string, userId: string) {
      return prisma.goal.findFirst({
        where: { id, userId },
        include: {
          plan: true,
          objective: true,
          skillTargets: { include: { skill: true } },
        },
      })
    },

    create(userId: string, data: CreateGoal) {
      const createData: Prisma.GoalUncheckedCreateInput = {
        userId,
        period: data.period,
        targetMinutes: data.targetMinutes,
        startDate: new Date(data.startDate),
        endDate: data.endDate ? new Date(data.endDate) : null,
        isActive: data.isActive,
        planId: data.planId ?? null,
        objectiveId: data.objectiveId ?? null,
      }

      if (data.skillTargets && data.skillTargets.length > 0) {
        createData.skillTargets = {
          create: data.skillTargets.map((st) => ({
            skillId: st.skillId,
            targetMinutes: st.targetMinutes,
          })),
        }
      }

      return prisma.goal.create({
        data: createData,
        include: {
          plan: true,
          objective: true,
          skillTargets: { include: { skill: true } },
        },
      })
    },

    async update(id: string, _userId: string, data: UpdateGoal) {
      return prisma.$transaction(async (tx) => {
        if (data.skillTargets !== undefined) {
          await tx.goalSkillTarget.deleteMany({ where: { goalId: id } })
        }

        const updateData: Prisma.GoalUncheckedUpdateInput = {
          ...(data.period ? { period: data.period } : {}),
          ...(data.targetMinutes !== undefined ? { targetMinutes: data.targetMinutes } : {}),
          ...(data.startDate ? { startDate: new Date(data.startDate) } : {}),
          ...(data.endDate !== undefined
            ? { endDate: data.endDate ? new Date(data.endDate) : null }
            : {}),
          ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
          ...(data.planId !== undefined ? { planId: data.planId ?? null } : {}),
          ...(data.objectiveId !== undefined ? { objectiveId: data.objectiveId ?? null } : {}),
        }

        if (data.skillTargets && data.skillTargets.length > 0) {
          updateData.skillTargets = {
            create: data.skillTargets.map((st) => ({
              skillId: st.skillId,
              targetMinutes: st.targetMinutes,
            })),
          }
        }

        return tx.goal.update({
          where: { id },
          data: updateData,
          include: {
            plan: true,
            objective: true,
            skillTargets: { include: { skill: true } },
          },
        })
      })
    },

    delete(id: string, _userId: string) {
      return prisma.goal.delete({ where: { id } })
    },
  }
}

export type GoalRepository = ReturnType<typeof createGoalRepository>
