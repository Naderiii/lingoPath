import type { Prisma, PrismaClient } from '@prisma/client'

/**
 * Data access for the study calendar. Reads are always expressed as
 * half-open UTC windows `[from, to)` computed from local day boundaries by the
 * service, so nothing in this layer has to know about timezones.
 */

const calendarSessionRelations = {
  skill: { select: { id: true, name: true } },
  category: { select: { id: true, name: true } },
  plan: { select: { id: true, title: true } },
  milestone: { select: { id: true, title: true } },
} satisfies Prisma.StudySessionInclude

export type CalendarSessionRow = Prisma.StudySessionGetPayload<{
  include: typeof calendarSessionRelations
}>

export interface CalendarSettingsRecord {
  intensityThresholds: number[]
  streakQualifyingMinutes: number
  updatedAt: Date
}

export interface CalendarSettingsUpdate {
  intensityThresholds?: number[]
  streakQualifyingMinutes?: number
}

export function createCalendarRepository(prisma: PrismaClient) {
  return {
    /**
     * Minimal two-column projection of the user's whole history, used to derive
     * streaks. Deliberately not a persisted streak counter: at personal-tracker
     * volumes (a few rows per active day) this stays cheap, and it keeps
     * `StudySession` as the only place study time is stored.
     */
    listActivitySessions(userId: string) {
      return prisma.studySession.findMany({
        where: { userId },
        select: { startedAt: true, durationMinutes: true },
        orderBy: { startedAt: 'asc' },
      })
    },

    /** Same minimal projection, restricted to a UTC window — used for the heatmap. */
    listActivitySessionsBetween(userId: string, from: Date, toExclusive: Date) {
      return prisma.studySession.findMany({
        where: { userId, startedAt: { gte: from, lt: toExclusive } },
        select: { startedAt: true, durationMinutes: true },
        orderBy: { startedAt: 'asc' },
      })
    },

    /** Full rows for one local day, newest last — used by the day drill-down. */
    listSessionsBetween(userId: string, from: Date, toExclusive: Date) {
      return prisma.studySession.findMany({
        where: { userId, startedAt: { gte: from, lt: toExclusive } },
        include: calendarSessionRelations,
        orderBy: { startedAt: 'asc' },
      })
    },

    async getUserTimeZone(userId: string): Promise<string | null> {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { timezone: true },
      })
      return user?.timezone ?? null
    },

    async getSettings(userId: string): Promise<CalendarSettingsRecord | null> {
      const settings = await prisma.calendarSetting.findUnique({
        where: { userId },
        select: { intensityThresholds: true, streakQualifyingMinutes: true, updatedAt: true },
      })
      return settings ?? null
    },

    async upsertSettings(
      userId: string,
      data: CalendarSettingsUpdate,
    ): Promise<CalendarSettingsRecord> {
      const settings = await prisma.calendarSetting.upsert({
        where: { userId },
        create: {
          userId,
          ...(data.intensityThresholds ? { intensityThresholds: data.intensityThresholds } : {}),
          ...(data.streakQualifyingMinutes !== undefined
            ? { streakQualifyingMinutes: data.streakQualifyingMinutes }
            : {}),
        },
        update: {
          ...(data.intensityThresholds ? { intensityThresholds: data.intensityThresholds } : {}),
          ...(data.streakQualifyingMinutes !== undefined
            ? { streakQualifyingMinutes: data.streakQualifyingMinutes }
            : {}),
        },
        select: { intensityThresholds: true, streakQualifyingMinutes: true, updatedAt: true },
      })
      return settings
    },
  }
}

export type CalendarRepository = ReturnType<typeof createCalendarRepository>
