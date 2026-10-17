/**
 * Data aggregation service — the first stage of the Phase 10 pipeline.
 *
 * Its whole job is to turn a user id into a `RecommendationContext`, and its
 * output is the boundary the rest of the pipeline trusts. What it does *not* do is
 * as important as what it does:
 *
 * - it never returns a `StudySession` row; per-skill totals and day × skill buckets
 *   are aggregated in SQL and arrive already reduced;
 * - it never reads notes, topics, descriptions or plan titles, so free text cannot
 *   reach a model through this path even by accident;
 * - it resolves the learner's timezone itself and converts every instant to a day
 *   key, so the context it produces has no timezone field to leak;
 * - it reuses the modules that already own a definition — goal progress from the
 *   goals module, plan totals from the plans module, streaks from the calendar
 *   module — instead of re-deriving any of them.
 */

import type { StreakSummaryResponse } from '@lingopath/types'
import { addDaysToDayKey, dayBoundsUtc, getDayKey, isValidTimeZone } from '../../shared/timezone.js'
import { DEFAULT_TIMEZONE } from '../../shared/current-user.js'
import { NotFoundError } from '../../shared/errors.js'
import type { RecommendationRepository } from './recommendation.repository.js'
import {
  buildRecommendationContext,
  RECENT_WINDOW_DAYS,
  type RawFeedback,
  type RawExam,
  type RawGoal,
  type RawPlan,
  type RecommendationContext,
} from './recommendation.context.js'

export interface RecommendationAggregationOptions {
  now?: () => Date
  maxAssessments?: number
  maxFeedback?: number
}

/** Sessions older than this are not needed: the windows only cover 28 days. */
const WINDOW_SPAN_DAYS = RECENT_WINDOW_DAYS * 2

export function createRecommendationAggregation(
  repository: RecommendationRepository,
  options: RecommendationAggregationOptions = {},
) {
  const now = options.now ?? ((): Date => new Date())
  const maxAssessments = options.maxAssessments ?? 12
  const maxFeedback = options.maxFeedback ?? 50

  async function buildContext(userId: string): Promise<RecommendationContext> {
    const startedAt = now()

    const user = await repository.findUser(userId)
    if (user === null) throw new NotFoundError('User', userId)

    // A stored but unusable timezone degrades to UTC here rather than throwing:
    // recommendations are not the place to surface a configuration problem.
    const timezone =
      user.timezone.length > 0 && isValidTimeZone(user.timezone) ? user.timezone : DEFAULT_TIMEZONE

    const today = getDayKey(startedAt, timezone)
    const windowStartDay = addDaysToDayKey(today, -(WINDOW_SPAN_DAYS - 1))
    const { start: windowStart } = dayBoundsUtc(windowStartDay, timezone)
    const { end: windowEndExclusive } = dayBoundsUtc(addDaysToDayKey(today, 1), timezone)

    const [
      objectiveCount,
      lifetime,
      skillTotals,
      buckets,
      recency,
      sessionPattern,
      skills,
      goals,
      plans,
      assessments,
      exams,
      feedbackRows,
      streak,
    ] = await Promise.all([
      repository.countObjectives(userId),
      repository.getLifetimeSummary(userId, timezone),
      repository.getSkillTotals(userId),
      repository.getDailySkillBuckets(userId, windowStart, windowEndExclusive, timezone),
      repository.getSkillRecency(userId),
      repository.getSessionPattern(userId, timezone),
      repository.listSkills(),
      repository.listActiveGoals(userId, startedAt),
      repository.listActivePlans(userId),
      repository.listAssessments(userId, maxAssessments),
      repository.listExams(userId),
      repository.listFeedback(userId, maxFeedback),
      repository.getStreak(userId, timezone),
    ])

    // Progress comes from the goals module, one call per active goal. Active goals
    // are few by construction, and reusing `calculateProgress` is what keeps the
    // numbers here identical to the ones on the goals page.
    const goalRows: RawGoal[] = await Promise.all(
      goals.map(async (goal) => {
        const progress = await repository.goalRepository.calculateProgress(
          goal.id,
          userId,
          timezone,
        )

        const skillTargets = goal.skillTargets.map((target) => {
          const actual =
            progress?.skillProgress.find((entry) => entry.skill.id === target.skillId)
              ?.actualMinutes ?? 0
          return {
            skillId: target.skillId,
            targetMinutes: target.targetMinutes,
            actualMinutes: actual,
          }
        })

        return {
          id: goal.id,
          period: goal.period,
          planId: goal.planId,
          objectiveId: goal.objectiveId,
          progress: {
            targetMinutes: progress?.targetMinutes ?? goal.targetMinutes,
            actualMinutes: progress?.actualMinutes ?? 0,
            percentage: progress?.percentage ?? 0,
            status: progress?.status ?? 'not_started',
            skillProgress: skillTargets,
          },
        }
      }),
    )

    const planRows: RawPlan[] = await Promise.all(
      plans.map(async (plan) => {
        const [actualMinutes, milestoneMinutes] = await Promise.all([
          repository.planRepository.getActualMinutesForPlan(plan.id),
          repository.planRepository.getActualMinutesByMilestone(plan.id),
        ])

        const minutesByMilestone = new Map(
          milestoneMinutes.milestones.map((entry) => [entry.milestoneId, entry.totalMinutes]),
        )

        return {
          id: plan.id,
          startDate: plan.startDate,
          endDate: plan.endDate,
          targetMinutes: plan.targetMinutes,
          actualMinutes,
          milestones: plan.milestones.map((milestone) => ({
            id: milestone.id,
            startDate: milestone.startDate,
            endDate: milestone.endDate,
            targetMinutes: milestone.targetMinutes,
            actualMinutes: minutesByMilestone.get(milestone.id) ?? 0,
            status: milestone.status,
            skillId: milestone.skillId,
          })),
        }
      }),
    )

    const feedback: RawFeedback[] = feedbackRows.map((row) => ({
      type: row.recommendation.type,
      action: row.action,
      // The evidence fingerprint is stored on the recommendation, so a decision
      // can be matched to the facts it was taken about.
      evidenceKey: row.recommendation.evidenceKey,
      objectiveId: row.recommendation.objectiveId,
      decidedAt: row.createdAt,
    }))

    const examRows: RawExam[] = exams.map((exam) => ({
      id: exam.id,
      type: exam.type,
      status: exam.status,
      scheduledAt: exam.scheduledAt,
      targetDate: exam.targetDate,
      targetScore: exam.targetScore,
      results: exam.results.map((result) => ({
        takenAt: result.takenAt,
        isMock: result.isMock,
        overallScore: result.overallScore,
        skillScores: toScoreMap(result.skillScores),
      })),
    }))

    return buildRecommendationContext({
      now: startedAt,
      timezone,
      objective: user.activeObjective
        ? {
            id: user.activeObjective.id,
            type: user.activeObjective.type,
            targetScore: user.activeObjective.targetScore,
            targetDate: user.activeObjective.targetDate,
          }
        : null,
      hasAnyObjective: objectiveCount > 0,
      lifetime,
      skillTotals,
      buckets,
      skillRecency: recency,
      sessionPattern,
      skills,
      goals: goalRows,
      plans: planRows,
      assessments,
      exams: examRows,
      feedback,
      streak: toStreakTotals(streak),
    })
  }

  return { buildContext }
}

/** Narrow view of the calendar module's streak payload. */
function toStreakTotals(streak: StreakSummaryResponse) {
  return { currentStreak: streak.currentStreak, longestStreak: streak.longestStreak }
}

/** Section scores are stored as JSON; only finite numbers survive the read. */
function toScoreMap(value: unknown): Record<string, number> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}

  const scores: Record<string, number> = {}
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === 'number' && Number.isFinite(raw)) scores[key] = raw
  }
  return scores
}

export type RecommendationAggregation = ReturnType<typeof createRecommendationAggregation>
