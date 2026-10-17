import type { PrismaClient } from '@prisma/client'
import { Prisma } from '@prisma/client'
import type { ListExamsQuery, CreateExam, UpdateExam, CreateExamResult } from '@lingopath/types'
import { keysetOrderBy, keysetWhere } from '../../shared/keyset-pagination.js'

export function createExamRepository(prisma: PrismaClient) {
  return {
    async findMany(userId: string, query: ListExamsQuery) {
      const { cursor, limit, status, type } = query

      const cursorWhere = await keysetWhere({
        cursor,
        field: 'createdAt',
        direction: 'desc',
        loadCursorValue: async () => {
          if (!cursor) return null
          const row = await prisma.exam.findFirst({
            where: { id: cursor, userId },
            select: { createdAt: true },
          })
          return row?.createdAt ?? null
        },
      })

      const exams = await prisma.exam.findMany({
        where: {
          userId,
          ...(status ? { status } : {}),
          ...(type ? { type } : {}),
          ...(cursorWhere ?? {}),
        },
        include: {
          objective: true,
          results: { orderBy: { takenAt: 'desc' } },
        },
        orderBy: keysetOrderBy('createdAt', 'desc'),
        take: limit + 1,
      })

      const hasMore = exams.length > limit
      const items = hasMore ? exams.slice(0, limit) : exams
      const nextCursor = hasMore && items.length > 0 ? (items[items.length - 1]?.id ?? null) : null

      return { items, nextCursor, hasMore }
    },

    findById(id: string, userId: string) {
      return prisma.exam.findFirst({
        where: { id, userId },
        include: {
          objective: true,
          results: { orderBy: { takenAt: 'desc' } },
        },
      })
    },

    create(userId: string, data: CreateExam) {
      return prisma.exam.create({
        data: {
          userId,
          type: data.type,
          title: data.title,
          objectiveId: data.objectiveId ?? null,
          scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
          venue: data.venue ?? null,
          status: data.status,
          targetScore: data.targetScore ?? null,
          targetDate: data.targetDate ? new Date(data.targetDate) : null,
          // Omitted when absent: for a nullable Json column Prisma distinguishes
          // "not provided" from `JsonNull`, and a brand-new exam has no descriptor.
          ...(data.scoreScale !== undefined
            ? { scoreScale: data.scoreScale as unknown as Prisma.InputJsonValue }
            : {}),
          notes: data.notes ?? null,
        },
        include: {
          objective: true,
          results: true,
        },
      })
    },

    update(id: string, _userId: string, data: UpdateExam) {
      return prisma.exam.update({
        where: { id },
        data: {
          ...(data.type ? { type: data.type } : {}),
          ...(data.title ? { title: data.title } : {}),
          ...(data.objectiveId !== undefined ? { objectiveId: data.objectiveId ?? null } : {}),
          ...(data.scheduledAt !== undefined
            ? { scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null }
            : {}),
          ...(data.venue !== undefined ? { venue: data.venue ?? null } : {}),
          ...(data.status ? { status: data.status } : {}),
          ...(data.targetScore !== undefined ? { targetScore: data.targetScore ?? null } : {}),
          ...(data.targetDate !== undefined
            ? { targetDate: data.targetDate ? new Date(data.targetDate) : null }
            : {}),
          // Clearing a Json column needs `DbNull`; plain `null` is rejected by
          // Prisma precisely so "set JSON null" and "remove the value" stay distinct.
          ...(data.scoreScale !== undefined
            ? {
                scoreScale:
                  data.scoreScale === null
                    ? Prisma.DbNull
                    : (data.scoreScale as unknown as Prisma.InputJsonValue),
              }
            : {}),
          ...(data.notes !== undefined ? { notes: data.notes ?? null } : {}),
        },
        include: {
          objective: true,
          results: { orderBy: { takenAt: 'desc' } },
        },
      })
    },

    delete(id: string, _userId: string) {
      return prisma.exam.delete({ where: { id } })
    },

    // ─── Exam Results ──────────────────────────────────────────────────────────

    createResult(examId: string, data: CreateExamResult) {
      return prisma.examResult.create({
        data: {
          examId,
          isMock: data.isMock,
          takenAt: new Date(data.takenAt),
          // A result may carry only section scores; an absent overall is stored as
          // null instead of being derived, so nothing is invented on the way in.
          overallScore: data.overallScore ?? null,
          skillScores: (data.skillScores ?? {}) as Prisma.InputJsonValue,
          notes: data.notes ?? null,
        },
      })
    },

    findResultsByExamId(examId: string) {
      return prisma.examResult.findMany({
        where: { examId },
        orderBy: { takenAt: 'desc' },
      })
    },
  }
}

export type ExamRepository = ReturnType<typeof createExamRepository>
