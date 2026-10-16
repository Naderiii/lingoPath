import type { PrismaClient } from '@prisma/client'
import type { DailySkillBucket } from './analytics.domain.js'
import { createPlanRepository } from '../plans/plan.repository.js'
import { createGoalRepository } from '../goals/goal.repository.js'

/**
 * Data access for analytics.
 *
 * Aggregation happens in the database:
 * - totals, counts and the longest session are Prisma `aggregate`/`findFirst`
 *   calls that translate to SQL with LIMIT 1 or SUM/COUNT;
 * - the day × skill breakdown is a single `GROUP BY` query whose day bucketing is
 *   done by Postgres (`date_trunc` over `AT TIME ZONE`), so DST, month and year
 *   boundaries follow the user's calendar instead of Node's.
 *
 * Only the requested window is ever materialised in Node: one row per active
 * (day, skill) pair, never the full session history.
 */
export function createAnalyticsRepository(prisma: PrismaClient) {
  return {
    /** SQL-side MAX via ORDER BY … LIMIT 1. */
    async getLongestSession(userId: string, from: Date, toExclusive: Date) {
      const session = await prisma.studySession.findFirst({
        where: { userId, startedAt: { gte: from, lt: toExclusive } },
        orderBy: [{ durationMinutes: 'desc' }, { id: 'desc' }],
        select: { id: true, durationMinutes: true, startedAt: true, skillId: true },
      })

      return session ?? null
    },

    /**
     * One `GROUP BY` per window: minutes and session counts per local day and
     * skill. `timeZone` is bound as a query parameter — the platform validates it
     * against `Intl` before it reaches this point.
     */
    async getDailySkillBuckets(
      userId: string,
      from: Date,
      toExclusive: Date,
      timeZone: string,
    ): Promise<DailySkillBucket[]> {
      const rows = await prisma.$queryRaw<
        Array<{ day: string; skillId: string; minutes: number; sessions: number }>
      >`
        SELECT
          to_char(date_trunc('day', "startedAt" AT TIME ZONE ${timeZone}), 'YYYY-MM-DD') AS "day",
          "skillId" AS "skillId",
          SUM("durationMinutes")::int AS "minutes",
          COUNT(*)::int AS "sessions"
        FROM study_sessions
        WHERE "userId" = ${userId}
          AND "startedAt" >= ${from}
          AND "startedAt" < ${toExclusive}
        GROUP BY 1, 2
        ORDER BY 1
      `

      return rows.map((row) => ({
        day: row.day,
        skillId: row.skillId,
        minutes: Number(row.minutes),
        sessions: Number(row.sessions),
      }))
    },

    /** Skill names for the ids that appear in the windows. */
    async getSkillsByIds(skillIds: readonly string[]) {
      if (skillIds.length === 0) return []
      return prisma.skill.findMany({
        where: { id: { in: [...skillIds] } },
        select: { id: true, name: true },
      })
    },

    /** Daily goal target used for "days meeting goal" (mirrors the dashboard). */
    async getActiveDailyGoalTarget(userId: string, now: Date): Promise<number | null> {
      const goal = await prisma.goal.findFirst({
        where: {
          userId,
          period: 'DAILY',
          isActive: true,
          startDate: { lte: now },
          OR: [{ endDate: null }, { endDate: { gte: now } }],
        },
        orderBy: { startDate: 'desc' },
        select: { targetMinutes: true },
      })

      return goal?.targetMinutes ?? null
    },

    /** Active long-term plans (plan analytics reuses the plans module). */
    async listActivePlans(userId: string) {
      return prisma.longTermPlan.findMany({
        where: { userId, status: 'ACTIVE' },
        include: {
          objective: { select: { id: true, title: true } },
          milestones: {
            where: { status: { not: 'CANCELLED' } },
            orderBy: { ordering: 'asc' },
            select: {
              id: true,
              title: true,
              status: true,
              startDate: true,
              endDate: true,
              targetMinutes: true,
              ordering: true,
            },
          },
        },
        orderBy: { startDate: 'desc' },
      })
    },

    /** Active goals with their canonical progress calculation. */
    async listActiveGoals(userId: string, now: Date) {
      return prisma.goal.findMany({
        where: {
          userId,
          isActive: true,
          startDate: { lte: now },
          OR: [{ endDate: null }, { endDate: { gte: now } }],
        },
        orderBy: [{ period: 'asc' }, { startDate: 'desc' }],
        select: {
          id: true,
          period: true,
          targetMinutes: true,
          startDate: true,
          endDate: true,
          planId: true,
        },
      })
    },

    // Reuse the owning modules instead of re-deriving their numbers.
    planRepository: createPlanRepository(prisma),
    goalRepository: createGoalRepository(prisma),
  }
}

export type AnalyticsRepository = ReturnType<typeof createAnalyticsRepository>
