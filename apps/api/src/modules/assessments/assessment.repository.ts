import type { PrismaClient } from '@prisma/client'
import type { ListLevelAssessmentsQuery, CreateLevelAssessment } from '@lingopath/types'

export function createAssessmentRepository(prisma: PrismaClient) {
  return {
    async findMany(userId: string, query: ListLevelAssessmentsQuery) {
      const { cursor, limit } = query

      const assessments = await prisma.levelAssessment.findMany({
        where: {
          userId,
          ...(cursor ? { id: { lt: cursor } } : {}),
        },
        orderBy: { assessedAt: 'desc' },
        take: limit + 1,
      })

      const hasMore = assessments.length > limit
      const items = hasMore ? assessments.slice(0, limit) : assessments
      const nextCursor = hasMore && items.length > 0 ? (items[items.length - 1]?.id ?? null) : null

      return { items, nextCursor, hasMore }
    },

    findById(id: string, userId: string) {
      return prisma.levelAssessment.findFirst({
        where: { id, userId },
      })
    },

    create(userId: string, data: CreateLevelAssessment) {
      return prisma.levelAssessment.create({
        data: {
          userId,
          cefrLevel: data.cefrLevel,
          assessedAt: new Date(data.assessedAt),
          method: data.method,
          notes: data.notes ?? null,
        },
      })
    },

    delete(id: string, _userId: string) {
      return prisma.levelAssessment.delete({
        where: { id },
      })
    },
  }
}

export type AssessmentRepository = ReturnType<typeof createAssessmentRepository>
