/**
 * Data access for recommendations (Phase 10).
 *
 * Two responsibilities, kept in one file because they share the same tables:
 *
 * - **Persistence** of generated recommendations and of every decision taken on
 *   them. Nothing here decides anything; status transitions are handed in.
 * - **Aggregation reads** used to build the controlled context. Everything that
 *   can be summed or grouped is summed or grouped in SQL, so the amount of
 *   learner data entering Node is bounded by the skill taxonomy — never by the
 *   length of the study history.
 *
 * The LLM has no path to this file. It lives on the other side of the adapter, and
 * the context it receives is built by pure code from these results.
 */

import type { Prisma, PrismaClient } from '@prisma/client'
import type {
  ObjectiveType,
  RecommendationAction,
  RecommendationStatus,
  RecommendationType,
} from '@lingopath/types'
import type { DailySkillBucket } from '../analytics/analytics.domain.js'
import { createGoalRepository } from '../goals/goal.repository.js'
import { createPlanRepository } from '../plans/plan.repository.js'
import { createPrismaStreakReader } from '../calendar/calendar.service.js'

export interface NewRecommendationRow {
  type: RecommendationType
  title: string
  recommendation: string
  rationale: string
  supportingData: unknown
  confidence: 'LOW' | 'MEDIUM' | 'HIGH'
  estimatedDurationMinutes: number | null
  relatedSkillId: string | null
  relatedGoalId: string | null
  relatedPlanId: string | null
  objectiveId: string | null
  objectiveType: ObjectiveType | null
  source: 'LLM' | 'RULE_BASED'
  evidenceKey: string
  suggestedAction: unknown
  generatedAt: Date
  expiresAt: Date | null
}

export interface RecommendationListFilter {
  status?: RecommendationStatus
  type?: RecommendationType
  limit: number
}

export function createRecommendationRepository(prisma: PrismaClient) {
  return {
    // Owning modules are reused rather than re-implemented: goal progress, plan
    // totals and the streak definition each exist exactly once in this codebase.
    goalRepository: createGoalRepository(prisma),
    planRepository: createPlanRepository(prisma),
    getStreak: createPrismaStreakReader(prisma),

    // ── Context reads ────────────────────────────────────────────────────────

    async findUser(userId: string) {
      return prisma.user.findUnique({
        where: { id: userId },
        select: {
          timezone: true,
          activeObjective: {
            select: { id: true, type: true, targetScore: true, targetDate: true },
          },
        },
      })
    },

    countObjectives(userId: string) {
      return prisma.learningObjective.count({ where: { userId } })
    },

    /** One row: totals, distinct active days and the first/last session. */
    async getLifetimeSummary(userId: string, timeZone: string) {
      const rows = await prisma.$queryRaw<
        Array<{
          minutes: number | null
          sessions: number
          activeDays: number
          firstStartedAt: Date | null
          lastStartedAt: Date | null
        }>
      >`
        SELECT
          COALESCE(SUM("durationMinutes"), 0)::int AS "minutes",
          COUNT(*)::int AS "sessions",
          COUNT(DISTINCT date_trunc('day', "startedAt" AT TIME ZONE ${timeZone}))::int AS "activeDays",
          MIN("startedAt") AS "firstStartedAt",
          MAX("startedAt") AS "lastStartedAt"
        FROM study_sessions
        WHERE "userId" = ${userId}
      `

      const row = rows[0]
      return {
        minutes: Number(row?.minutes ?? 0),
        sessions: Number(row?.sessions ?? 0),
        activeDays: Number(row?.activeDays ?? 0),
        firstStartedAt: row?.firstStartedAt ?? null,
        lastStartedAt: row?.lastStartedAt ?? null,
      }
    },

    /** All-time minutes and session counts per skill (SQL `GROUP BY`). */
    async getSkillTotals(userId: string) {
      const rows = await prisma.studySession.groupBy({
        by: ['skillId'],
        where: { userId },
        _sum: { durationMinutes: true },
        _count: { _all: true },
      })

      return rows.map((row) => ({
        skillId: row.skillId,
        minutes: Number(row._sum.durationMinutes ?? 0),
        sessions: Number(row._count._all ?? 0),
      }))
    },

    /**
     * Day × skill rows for one window, bucketed by the learner's local day in
     * Postgres so DST and month boundaries follow their calendar.
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

    /** Most recent session per skill, all time. */
    async getSkillRecency(userId: string) {
      const rows = await prisma.studySession.groupBy({
        by: ['skillId'],
        where: { userId },
        _max: { startedAt: true },
      })

      return rows.flatMap((row) =>
        row._max.startedAt === null
          ? []
          : [{ skillId: row.skillId, lastStartedAt: row._max.startedAt }],
      )
    },

    /**
     * Median session length and the most common local start hour, computed in the
     * database. Two summary numbers instead of every duration: the engine needs a
     * shape, not the sessions.
     */
    async getSessionPattern(userId: string, timeZone: string) {
      const rows = await prisma.$queryRaw<
        Array<{ medianMinutes: number | null; startHour: number | null }>
      >`
        SELECT
          percentile_cont(0.5) WITHIN GROUP (ORDER BY "durationMinutes") AS "medianMinutes",
          mode() WITHIN GROUP (
            ORDER BY EXTRACT(hour FROM "startedAt" AT TIME ZONE ${timeZone})
          )::int AS "startHour"
        FROM study_sessions
        WHERE "userId" = ${userId}
      `

      const row = rows[0]
      return {
        medianMinutes:
          row?.medianMinutes === null || row?.medianMinutes === undefined
            ? null
            : Math.round(Number(row.medianMinutes)),
        preferredStartHour:
          row?.startHour === null || row?.startHour === undefined ? null : Number(row.startHour),
      }
    },

    listSkills() {
      return prisma.skill.findMany({
        select: { id: true, name: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      })
    },

    /** Goals whose period is running now, with the skill split the learner set. */
    listActiveGoals(userId: string, now: Date) {
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
          objectiveId: true,
          skillTargets: { select: { skillId: true, targetMinutes: true } },
        },
      })
    },

    listActivePlans(userId: string) {
      return prisma.longTermPlan.findMany({
        where: { userId, status: 'ACTIVE' },
        orderBy: { startDate: 'desc' },
        select: {
          id: true,
          startDate: true,
          endDate: true,
          targetMinutes: true,
          milestones: {
            where: { status: { not: 'CANCELLED' } },
            orderBy: { ordering: 'asc' },
            select: {
              id: true,
              startDate: true,
              endDate: true,
              targetMinutes: true,
              status: true,
              skillId: true,
            },
          },
        },
      })
    },

    listAssessments(userId: string, take: number) {
      return prisma.levelAssessment.findMany({
        where: { userId },
        orderBy: [{ assessedAt: 'desc' }, { id: 'asc' }],
        take,
        select: {
          id: true,
          assessedAt: true,
          method: true,
          cefrLevel: true,
          listeningLevel: true,
          readingLevel: true,
          writingLevel: true,
          speakingLevel: true,
        },
      })
    },

    listExams(userId: string) {
      return prisma.exam.findMany({
        where: { userId, status: { not: 'CANCELLED' } },
        orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          type: true,
          status: true,
          scheduledAt: true,
          targetDate: true,
          targetScore: true,
          results: {
            orderBy: [{ takenAt: 'desc' }, { id: 'asc' }],
            take: 3,
            select: { takenAt: true, isMock: true, overallScore: true, skillScores: true },
          },
        },
      })
    },

    /** Recent decisions, newest first, with the facts they were taken about. */
    listFeedback(userId: string, take: number) {
      return prisma.recommendationFeedback.findMany({
        where: { userId },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take,
        select: {
          action: true,
          createdAt: true,
          recommendation: {
            select: { type: true, evidenceKey: true, objectiveId: true },
          },
        },
      })
    },

    async getSkillNames(ids: readonly string[]) {
      if (ids.length === 0) return []
      return prisma.skill.findMany({
        where: { id: { in: [...ids] } },
        select: { id: true, name: true },
      })
    },

    // ── Persistence ──────────────────────────────────────────────────────────

    async createMany(userId: string, rows: readonly NewRecommendationRow[]) {
      if (rows.length === 0) return []

      return prisma.$transaction(
        rows.map((row) =>
          prisma.recommendation.create({
            data: {
              userId,
              type: row.type,
              title: row.title,
              recommendation: row.recommendation,
              rationale: row.rationale,
              supportingData: row.supportingData as Prisma.InputJsonValue,
              confidence: row.confidence,
              estimatedDurationMinutes: row.estimatedDurationMinutes,
              relatedSkillId: row.relatedSkillId,
              relatedGoalId: row.relatedGoalId,
              relatedPlanId: row.relatedPlanId,
              objectiveId: row.objectiveId,
              objectiveType: row.objectiveType,
              source: row.source,
              evidenceKey: row.evidenceKey,
              ...(row.suggestedAction === null || row.suggestedAction === undefined
                ? {}
                : { suggestedAction: row.suggestedAction as Prisma.InputJsonValue }),
              generatedAt: row.generatedAt,
              expiresAt: row.expiresAt,
            },
          }),
        ),
      )
    },

    /**
     * Retires the previous batch when a new one is generated.
     *
     * Every open row is retired, including one that belonged to an objective the
     * learner has since switched away from — which is how an IELTS → TOEFL switch
     * stops old advice from lingering as if it were still current.
     */
    supersedeOpen(userId: string) {
      return prisma.recommendation.updateMany({
        where: { userId, status: 'NEW' },
        data: { status: 'SUPERSEDED' },
      })
    },

    expireStale(userId: string, now: Date) {
      return prisma.recommendation.updateMany({
        where: { userId, status: 'NEW', expiresAt: { lt: now } },
        data: { status: 'EXPIRED' },
      })
    },

    findMany(userId: string, filter: RecommendationListFilter) {
      return prisma.recommendation.findMany({
        where: {
          userId,
          ...(filter.status ? { status: filter.status } : {}),
          ...(filter.type ? { type: filter.type } : {}),
        },
        orderBy: [{ generatedAt: 'desc' }, { id: 'desc' }],
        take: filter.limit,
      })
    },

    findById(id: string, userId: string) {
      return prisma.recommendation.findFirst({ where: { id, userId } })
    },

    /** Records a decision and moves the recommendation's status in one transaction. */
    async recordDecision(input: {
      recommendationId: string
      userId: string
      action: RecommendationAction
      status: RecommendationStatus
      reason: string | null
      at: Date
    }) {
      return prisma.$transaction(async (tx) => {
        const updated = await tx.recommendation.updateMany({
          where: { id: input.recommendationId, userId: input.userId },
          data: { status: input.status, decidedAt: input.at },
        })

        if (updated.count === 0) return { feedbackId: null, recommendation: null }

        const feedback = await tx.recommendationFeedback.create({
          data: {
            recommendationId: input.recommendationId,
            userId: input.userId,
            action: input.action,
            reason: input.reason,
            createdAt: input.at,
          },
          select: { id: true },
        })

        const recommendation = await tx.recommendation.findUnique({
          where: { id: input.recommendationId },
        })

        return { feedbackId: feedback.id, recommendation }
      })
    },

    markApplied(input: { recommendationId: string; userId: string; goalId: string; at: Date }) {
      return prisma.recommendation.updateMany({
        where: { id: input.recommendationId, userId: input.userId },
        data: { appliedAt: input.at, appliedGoalId: input.goalId },
      })
    },
  }
}

export type RecommendationRepository = ReturnType<typeof createRecommendationRepository>
