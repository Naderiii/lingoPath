import type { PrismaClient } from '@prisma/client'

export function createSkillRepository(prisma: PrismaClient) {
  return {
    findAll() {
      return prisma.skill.findMany({
        orderBy: { sortOrder: 'asc' },
      })
    },

    findById(id: string) {
      return prisma.skill.findUnique({ where: { id } })
    },
  }
}

export type SkillRepository = ReturnType<typeof createSkillRepository>
