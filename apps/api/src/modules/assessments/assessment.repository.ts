import type { PrismaClient } from '@prisma/client'
import type {
  AssessmentMethod,
  CefrLevel,
  CreateLevelAssessment,
  ListLevelAssessmentsQuery,
} from '@lingopath/types'
import type { DimensionField } from './level.domain.js'
import { keysetOrderBy, keysetWhere } from '../../shared/keyset-pagination.js'

/**
 * What an update writes: the already-merged level set (every dimension present,
 * `null` meaning "not assessed") plus the optional non-level fields.
 */
export type AssessmentWriteInput = Record<DimensionField, CefrLevel | null> & {
  assessedAt?: Date
  method?: AssessmentMethod
  notes?: string | null
}

export function createAssessmentRepository(prisma: PrismaClient) {
  return {
    async findMany(userId: string, query: ListLevelAssessmentsQuery) {
      const { cursor, limit } = query

      const cursorWhere = await keysetWhere({
        cursor,
        field: 'assessedAt',
        direction: 'desc',
        loadCursorValue: async () => {
          if (!cursor) return null
          const row = await prisma.levelAssessment.findFirst({
            where: { id: cursor, userId },
            select: { assessedAt: true },
          })
          return row?.assessedAt ?? null
        },
      })

      const assessments = await prisma.levelAssessment.findMany({
        where: {
          userId,
          ...(cursorWhere ?? {}),
        },
        orderBy: keysetOrderBy('assessedAt', 'desc'),
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

    /**
     * Every assessment for the user, newest first, carrying only the level columns.
     *
     * "Most recently recorded level per dimension" cannot be answered from one
     * page: a newer assessment may have skipped the very dimension an older one
     * recorded. Assessments are low-cardinality (a handful per year, and only five
     * level columns are selected), so the snapshot pass reads them all instead of
     * paging and silently ageing a level.
     */
    findAllLevels(userId: string) {
      return prisma.levelAssessment.findMany({
        where: { userId },
        select: {
          id: true,
          userId: true,
          assessedAt: true,
          method: true,
          cefrLevel: true,
          listeningLevel: true,
          readingLevel: true,
          writingLevel: true,
          speakingLevel: true,
          notes: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: keysetOrderBy('assessedAt', 'desc'),
      })
    },

    create(userId: string, data: CreateLevelAssessment) {
      return prisma.levelAssessment.create({
        data: {
          userId,
          cefrLevel: data.cefrLevel ?? null,
          listeningLevel: data.listeningLevel ?? null,
          readingLevel: data.readingLevel ?? null,
          writingLevel: data.writingLevel ?? null,
          speakingLevel: data.speakingLevel ?? null,
          assessedAt: new Date(data.assessedAt),
          method: data.method,
          notes: data.notes ?? null,
        },
      })
    },

    /**
     * Writes the already-merged level set, so all five dimensions come from one
     * value set and a partial update can never leave a dimension half-applied.
     */
    update(id: string, _userId: string, write: AssessmentWriteInput) {
      return prisma.levelAssessment.update({
        where: { id },
        data: {
          cefrLevel: write.cefrLevel,
          listeningLevel: write.listeningLevel,
          readingLevel: write.readingLevel,
          writingLevel: write.writingLevel,
          speakingLevel: write.speakingLevel,
          ...(write.assessedAt !== undefined ? { assessedAt: write.assessedAt } : {}),
          ...(write.method !== undefined ? { method: write.method } : {}),
          ...(write.notes !== undefined ? { notes: write.notes } : {}),
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
