import type { PrismaClient } from '@prisma/client'
import type { CreateCategory, UpdateCategory } from '@lingopath/types'

export function createCategoryRepository(prisma: PrismaClient) {
  return {
    findAll(userId: string) {
      return prisma.category.findMany({
        where: {
          OR: [{ userId: null }, { userId }],
        },
        orderBy: { sortOrder: 'asc' },
      })
    },

    findById(id: string, userId: string) {
      return prisma.category.findFirst({
        where: {
          id,
          OR: [{ userId: null }, { userId }],
        },
      })
    },

    findByName(name: string, userId: string) {
      return prisma.category.findFirst({
        where: {
          name,
          OR: [{ userId: null }, { userId }],
        },
      })
    },

    create(userId: string, data: CreateCategory) {
      return prisma.category.create({
        data: {
          userId,
          name: data.name,
          description: data.description ?? null,
          sortOrder: data.sortOrder,
          isDefault: false,
        },
      })
    },

    update(id: string, _userId: string, data: UpdateCategory) {
      return prisma.category.update({
        where: { id },
        data: {
          ...(data.name ? { name: data.name } : {}),
          ...(data.description !== undefined ? { description: data.description ?? null } : {}),
          ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
        },
      })
    },

    delete(id: string, userId: string) {
      return prisma.category.delete({
        where: { id, userId },
      })
    },
  }
}

export type CategoryRepository = ReturnType<typeof createCategoryRepository>
