import type { PrismaClient } from '@prisma/client'
import type {
  ListStudySessionsQuery,
  CreateStudySession,
  UpdateStudySession,
} from '@lingopath/types'

export function createSessionRepository(prisma: PrismaClient) {
  return {
    async findMany(userId: string, query: ListStudySessionsQuery) {
      const { cursor, limit, skillId, categoryId, planId, from, to, search, sortBy, sortOrder } =
        query

      const searchFilter = search
        ? {
            OR: [
              { topic: { contains: search, mode: 'insensitive' as const } },
              { notes: { contains: search, mode: 'insensitive' as const } },
              { description: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}

      const sessions = await prisma.studySession.findMany({
        where: {
          userId,
          ...(skillId ? { skillId } : {}),
          ...(categoryId ? { categoryId } : {}),
          ...(planId ? { planId } : {}),
          ...(from || to
            ? {
                startedAt: {
                  ...(from ? { gte: new Date(from) } : {}),
                  ...(to ? { lte: new Date(to) } : {}),
                },
              }
            : {}),
          ...(cursor ? { id: { lt: cursor } } : {}),
          ...searchFilter,
        },
        include: { skill: true, category: true, plan: true, milestone: true },
        orderBy: { [sortBy ?? 'startedAt']: sortOrder ?? 'desc' },
        take: limit + 1,
      })

      const hasMore = sessions.length > limit
      const items = hasMore ? sessions.slice(0, limit) : sessions
      const nextCursor = hasMore && items.length > 0 ? (items[items.length - 1]?.id ?? null) : null

      return { items, nextCursor, hasMore }
    },

    async getTodayStats(userId: string, timezone: string) {
      // Calculate today's start/end in the user's timezone
      const now = new Date()
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
      const todayStr = formatter.format(now) // YYYY-MM-DD

      // Create start/end of day in the user's timezone
      const todayStart = new Date(`${todayStr}T00:00:00`)
      const todayEnd = new Date(`${todayStr}T23:59:59.999`)

      // Adjust to UTC based on timezone offset
      const offsetMs = todayStart.getTime() - new Date(`${todayStr}T00:00:00Z`).getTime()
      const utcStart = new Date(todayStart.getTime() - offsetMs)
      const utcEnd = new Date(todayEnd.getTime() - offsetMs)

      const todaySessions = await prisma.studySession.findMany({
        where: {
          userId,
          startedAt: { gte: utcStart, lte: utcEnd },
        },
        include: { skill: true, category: true },
        orderBy: { startedAt: 'desc' },
      })

      const totalMinutes = todaySessions.reduce((sum, s) => sum + s.durationMinutes, 0)

      return { todaySessions, totalMinutes }
    },

    async getStreak(userId: string, timezone: string) {
      // Count consecutive days with study sessions going backwards from today
      const now = new Date()
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })

      let streak = 0
      let currentDate = new Date(formatter.format(now))

      for (let i = 0; i < 365; i++) {
        const dateStr = currentDate.toISOString().split('T')[0]!
        const dayStart = new Date(`${dateStr}T00:00:00Z`)
        const dayEnd = new Date(`${dateStr}T23:59:59.999Z`)

        const count = await prisma.studySession.count({
          where: {
            userId,
            startedAt: { gte: dayStart, lte: dayEnd },
          },
        })

        if (count > 0) {
          streak++
        } else if (i > 0) {
          // Skip today (i === 0) if no sessions yet, but break for any past day with no sessions
          break
        }

        // Go back one day
        currentDate = new Date(currentDate.getTime() - 86400000)
      }

      return streak
    },

    findById(id: string, userId: string) {
      return prisma.studySession.findFirst({
        where: { id, userId },
        include: { skill: true, category: true, plan: true, milestone: true },
      })
    },

    create(userId: string, data: CreateStudySession & { durationMinutes: number }) {
      return prisma.studySession.create({
        data: {
          userId,
          skillId: data.skillId,
          categoryId: data.categoryId ?? null,
          topic: data.topic ?? null,
          description: data.description ?? null,
          startedAt: new Date(data.startedAt),
          endedAt: new Date(data.endedAt),
          durationMinutes: data.durationMinutes,
          selfRating: data.selfRating ?? null,
          notes: data.notes ?? null,
          isManual: data.isManual,
          planId: data.planId ?? null,
          milestoneId: data.milestoneId ?? null,
        },
        include: { skill: true, category: true, plan: true, milestone: true },
      })
    },

    update(id: string, _userId: string, data: UpdateStudySession & { durationMinutes?: number }) {
      return prisma.studySession.update({
        where: { id },
        data: {
          ...(data.skillId ? { skillId: data.skillId } : {}),
          ...(data.categoryId !== undefined ? { categoryId: data.categoryId ?? null } : {}),
          ...(data.topic !== undefined ? { topic: data.topic ?? null } : {}),
          ...(data.description !== undefined ? { description: data.description ?? null } : {}),
          ...(data.startedAt ? { startedAt: new Date(data.startedAt) } : {}),
          ...(data.endedAt ? { endedAt: new Date(data.endedAt) } : {}),
          ...(data.durationMinutes !== undefined ? { durationMinutes: data.durationMinutes } : {}),
          ...(data.selfRating !== undefined ? { selfRating: data.selfRating ?? null } : {}),
          ...(data.notes !== undefined ? { notes: data.notes ?? null } : {}),
          ...(data.isManual !== undefined ? { isManual: data.isManual } : {}),
          ...(data.planId !== undefined ? { planId: data.planId ?? null } : {}),
          ...(data.milestoneId !== undefined ? { milestoneId: data.milestoneId ?? null } : {}),
        },
        include: { skill: true, category: true, plan: true, milestone: true },
      })
    },

    delete(id: string, _userId: string) {
      return prisma.studySession.delete({ where: { id } })
    },
  }
}

export type SessionRepository = ReturnType<typeof createSessionRepository>
