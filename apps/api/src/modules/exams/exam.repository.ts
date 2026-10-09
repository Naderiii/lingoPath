import type { PrismaClient, Prisma } from '@prisma/client'
import type { ListExamsQuery, CreateExam, UpdateExam, CreateExamResult } from '@lingopath/types'

export function createExamRepository(prisma: PrismaClient) {
  return {
    async findMany(userId: string, query: ListExamsQuery) {
      const { cursor, limit, status, type } = query

      const exams = await prisma.exam.findMany({
        where: {
          userId,
          ...(status ? { status } : {}),
          ...(type ? { type } : {}),
          ...(cursor ? { id: { lt: cursor } } : {}),
        },
        include: {
          objective: true,
          results: { orderBy: { takenAt: 'desc' } },
        },
        orderBy: { createdAt: 'desc' },
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
          overallScore: data.overallScore,
          skillScores: data.skillScores as unknown as Prisma.InputJsonValue,
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
