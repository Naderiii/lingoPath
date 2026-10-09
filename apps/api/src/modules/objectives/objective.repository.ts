import type { PrismaClient } from '@prisma/client'
import type { CreateLearningObjective, UpdateLearningObjective } from '@lingopath/types'

export function createObjectiveRepository(prisma: PrismaClient) {
  return {
    findAll(userId: string) {
      return prisma.learningObjective.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      })
    },

    findById(id: string, userId: string) {
      return prisma.learningObjective.findFirst({
        where: { id, userId },
      })
    },

    create(userId: string, data: CreateLearningObjective) {
      return prisma.learningObjective.create({
        data: {
          userId,
          type: data.type,
          title: data.title,
          description: data.description ?? null,
          targetScore: data.targetScore ?? null,
          targetDate: data.targetDate ? new Date(data.targetDate) : null,
          isActive: data.isActive,
        },
      })
    },

    update(id: string, _userId: string, data: UpdateLearningObjective) {
      return prisma.learningObjective.update({
        where: { id },
        data: {
          ...(data.type ? { type: data.type } : {}),
          ...(data.title ? { title: data.title } : {}),
          ...(data.description !== undefined ? { description: data.description ?? null } : {}),
          ...(data.targetScore !== undefined ? { targetScore: data.targetScore ?? null } : {}),
          ...(data.targetDate !== undefined
            ? { targetDate: data.targetDate ? new Date(data.targetDate) : null }
            : {}),
          ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        },
      })
    },

    delete(id: string, _userId: string) {
      return prisma.learningObjective.delete({
        where: { id },
      })
    },
  }
}

export type ObjectiveRepository = ReturnType<typeof createObjectiveRepository>
