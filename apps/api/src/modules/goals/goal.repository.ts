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

    async calculateProgress(goalId: string, userId: string) {
      const goal = await prisma.goal.findFirst({
        where: { id: goalId, userId },
        include: { skillTargets: { include: { skill: true } } },
      })

      if (!goal) {
        return null
      }

      // Query study sessions within goal date range
      const sessions = await prisma.studySession.findMany({
        where: {
          userId,
          startedAt: {
            gte: goal.startDate,
            ...(goal.endDate ? { lte: goal.endDate } : {}),
          },
          ...(goal.planId ? { planId: goal.planId } : {}),
        },
        include: { skill: true },
      })

      // Calculate total actual minutes
      const actualMinutes = sessions.reduce((sum, session) => sum + session.durationMinutes, 0)

      // Calculate per-skill actual minutes
      const skillProgress: Record<string, { targetMinutes: number; actualMinutes: number; skill: { id: string; name: string } }> = {}

      if (goal.skillTargets.length > 0) {
        goal.skillTargets.forEach((target) => {
          skillProgress[target.skillId] = {
            targetMinutes: target.targetMinutes,
            actualMinutes: 0,
            skill: { id: target.skill.id, name: target.skill.name },
          }
        })

        sessions.forEach((session) => {
          if (skillProgress[session.skillId]) {
            skillProgress[session.skillId]!.actualMinutes += session.durationMinutes
          }
        })
      }

      const targetMinutes = goal.targetMinutes
      const remainingMinutes = Math.max(0, targetMinutes - actualMinutes)
      const percentage = targetMinutes > 0 ? Math.round((actualMinutes / targetMinutes) * 100) : 0

      return {
        targetMinutes,
        actualMinutes,
        remainingMinutes,
        percentage,
        status: actualMinutes >= targetMinutes ? 'completed' : actualMinutes > 0 ? 'in_progress' : 'not_started',
        skillProgress: Object.values(skillProgress),
      }
    },
  }
}

export type GoalRepository = ReturnType<typeof createGoalRepository>
