import type { PrismaClient } from '@prisma/client'
import type {
  ListStudySessionsQuery,
  CreateStudySession,
  UpdateStudySession,
} from '@lingopath/types'

export function createSessionRepository(prisma: PrismaClient) {
  return {
    async findMany(userId: string, query: ListStudySessionsQuery) {
      const { cursor, limit, skillId, from, to } = query

      const sessions = await prisma.studySession.findMany({
        where: {
          userId,
          ...(skillId ? { skillId } : {}),
          ...(from || to
            ? {
                startedAt: {
                  ...(from ? { gte: new Date(from) } : {}),
                  ...(to ? { lte: new Date(to) } : {}),
                },
              }
            : {}),
          ...(cursor ? { id: { lt: cursor } } : {}),
        },
        include: { skill: true },
        orderBy: { startedAt: 'desc' },
        take: limit + 1, // fetch one extra to determine hasMore
      })

      const hasMore = sessions.length > limit
      const items = hasMore ? sessions.slice(0, limit) : sessions
      const nextCursor = hasMore && items.length > 0 ? (items[items.length - 1]?.id ?? null) : null

      return { items, nextCursor, hasMore }
    },

    findById(id: string, userId: string) {
      return prisma.studySession.findFirst({
        where: { id, userId },
        include: { skill: true },
      })
    },

    create(userId: string, data: CreateStudySession & { durationMinutes: number }) {
      return prisma.studySession.create({
        data: {
          userId,
          skillId: data.skillId,
          startedAt: new Date(data.startedAt),
          endedAt: new Date(data.endedAt),
          durationMinutes: data.durationMinutes,
          notes: data.notes ?? null,
          isManual: data.isManual,
        },
        include: { skill: true },
      })
    },

    update(id: string, _userId: string, data: UpdateStudySession & { durationMinutes?: number }) {
      return prisma.studySession.update({
        where: { id },
        data: {
          ...(data.skillId ? { skillId: data.skillId } : {}),
          ...(data.startedAt ? { startedAt: new Date(data.startedAt) } : {}),
          ...(data.endedAt ? { endedAt: new Date(data.endedAt) } : {}),
          ...(data.durationMinutes !== undefined ? { durationMinutes: data.durationMinutes } : {}),
          ...(data.notes !== undefined ? { notes: data.notes ?? null } : {}),
          ...(data.isManual !== undefined ? { isManual: data.isManual } : {}),
        },
        include: { skill: true },
      })
    },

    delete(id: string, _userId: string) {
      return prisma.studySession.delete({ where: { id } })
    },
  }
}

export type SessionRepository = ReturnType<typeof createSessionRepository>
