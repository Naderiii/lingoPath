import type { GoalPeriod, StreakSummaryResponse } from '@lingopath/types'
import { DEFAULT_TIMEZONE } from '../../shared/current-user.js'
import { ValidationError } from '../../shared/errors.js'
import {
  computeElapsedDays,
  computeRemainingDays,
  computeStudyProgressPercent,
  computeTimeProgressPercent,
  computeTotalDays,
  formatMinutes,
} from '../plans/plan.service.js'
import { isValidTimeZone } from '../../shared/timezone.js'
import type { StreakReader } from '../calendar/calendar.service.js'
import {
  average,
  buildSkillTrend,
  buildTrend,
  compareMetrics,
  foldBuckets,
  MAX_ANALYTICS_RANGE_DAYS,
  percentageOf,
  percentageOfDaysMeetingTarget,
  rangeToUtcWindow,
  requiredDailyMinutes,
  resolveAnalyticsRange,
  resolvePaceStatus,
  todayKeyIn,
  trendGranularityFor,
  type AnalyticsRangeKind,
  type MetricDelta,
  type PaceStatus,
  type SkillTrend,
  type TrendGranularity,
  type TrendPoint,
} from './analytics.domain.js'
import type { AnalyticsRepository } from './analytics.repository.js'

/** Mirrors the dashboard's fallback when no DAILY goal is configured. */
export const DEFAULT_DAILY_TARGET_MINUTES = 60

export interface AnalyticsRequest {
  range: AnalyticsRangeKind
  from?: string
  to?: string
  timeZone?: string
}

export interface AnalyticsServiceOptions {
  now?: () => Date
}

export interface AnalyticsSkillAnalytics {
  skillId: string
  name: string
  totalMinutes: number
  percentage: number
  sessions: number
  averageSessionMinutes: number
  trend: SkillTrend
}

export interface AnalyticsSummary {
  totalMinutes: number
  totalMinutesFormatted: string
  totalSessions: number
  activeDays: number
  inactiveDays: number
  daysInRange: number
  averageDailyMinutes: number
  averageSessionMinutes: number
  longestSession: {
    id: string
    minutes: number
    minutesFormatted: string
    date: string
    skillId: string
  } | null
  currentStreak: number
  longestStreak: number
  qualifyingMinutes: number
  dailyTargetMinutes: number
  daysMeetingTarget: number
  percentageOfDaysMeetingTarget: number
}

export interface AnalyticsComparisonSide {
  from: string
  to: string
  totalMinutes: number
  totalSessions: number
  activeDays: number
  averageDailyMinutes: number
}

export interface AnalyticsPlanMilestone {
  milestoneId: string
  title: string
  status: string
  startDate: string
  endDate: string
  targetMinutes: number
  actualMinutes: number
  progressPercent: number
  remainingDays: number
  isCurrent: boolean
  isNext: boolean
}

export interface AnalyticsPlan {
  planId: string
  title: string
  objectiveTitle: string | null
  startDate: string
  endDate: string
  targetMinutes: number
  actualMinutes: number
  remainingMinutes: number
  unassignedMinutes: number
  studyProgressPercent: number
  timeProgressPercent: number
  elapsedDays: number
  totalDays: number
  remainingDays: number
  paceStatus: PaceStatus
  requiredDailyMinutes: number
  milestones: AnalyticsPlanMilestone[]
  monthly: Array<{ month: string; totalMinutes: number }>
  weekly: Array<{ weekStart: string; totalMinutes: number }>
}

export interface AnalyticsGoal {
  id: string
  period: GoalPeriod
  targetMinutes: number
  actualMinutes: number
  remainingMinutes: number
  percentage: number
  status: string
}

export interface AnalyticsPayload {
  range: {
    kind: AnalyticsRangeKind
    from: string
    to: string
    days: number
    comparisonBasis: 'preceding-window' | 'same-period-last-year'
  }
  previousRange: { from: string; to: string }
  timezone: string
  summary: AnalyticsSummary
  skills: AnalyticsSkillAnalytics[]
  trends: { granularity: TrendGranularity; points: TrendPoint[] }
  comparison: {
    current: AnalyticsComparisonSide
    previous: AnalyticsComparisonSide
    deltas: {
      totalMinutes: MetricDelta
      totalSessions: MetricDelta
      activeDays: MetricDelta
      averageDailyMinutes: MetricDelta
    }
  }
  plans: AnalyticsPlan[]
  goals: AnalyticsGoal[]
}

export function createAnalyticsService(
  repository: AnalyticsRepository,
  deps: { getStreak: StreakReader },
  options: AnalyticsServiceOptions = {},
) {
  const now = options.now ?? ((): Date => new Date())

  function resolveTimeZone(override?: string): string {
    if (override === undefined) return DEFAULT_TIMEZONE
    if (!isValidTimeZone(override)) {
      throw new ValidationError(`Unknown IANA timezone '${override}'`)
    }
    return override
  }

  async function loadWindow(
    userId: string,
    from: string,
    to: string,
    timeZone: string,
  ): Promise<{
    buckets: Awaited<ReturnType<AnalyticsRepository['getDailySkillBuckets']>>
    longest: Awaited<ReturnType<AnalyticsRepository['getLongestSession']>>
  }> {
    const { start, end } = rangeToUtcWindow({ from, to }, timeZone)

    // One grouped query supplies the whole window: totals, per-day and per-skill
    // rows come from the same result set, so the summary and the comparison can
    // never disagree with each other.
    const [buckets, longest] = await Promise.all([
      repository.getDailySkillBuckets(userId, start, end, timeZone),
      repository.getLongestSession(userId, start, end),
    ])

    return { buckets, longest }
  }

  async function getAnalytics(
    userId: string,
    request: AnalyticsRequest,
  ): Promise<AnalyticsPayload> {
    const timeZone = resolveTimeZone(request.timeZone)
    const todayKey = todayKeyIn(timeZone, now())

    if (request.range === 'custom' && (!request.from || !request.to)) {
      throw new ValidationError('A custom range requires both `from` and `to`')
    }

    const range = resolveAnalyticsRange({
      range: request.range,
      ...(request.from !== undefined ? { from: request.from } : {}),
      ...(request.to !== undefined ? { to: request.to } : {}),
      todayKey,
    })

    if (range.days > MAX_ANALYTICS_RANGE_DAYS) {
      throw new ValidationError(`Analytics ranges are limited to ${MAX_ANALYTICS_RANGE_DAYS} days`)
    }

    // Current window, previous window and the canonical streak reader all in
    // parallel; each is a bounded, SQL-side aggregation.
    const [current, previous, streak, dailyGoalTarget, plans, goals] = await Promise.all([
      loadWindow(userId, range.from, range.to, timeZone),
      loadWindow(userId, range.previousFrom, range.previousTo, timeZone),
      deps.getStreak(userId, timeZone),
      repository.getActiveDailyGoalTarget(userId, now()),
      repository.listActivePlans(userId),
      repository.listActiveGoals(userId, now()),
    ])
    const folded = foldBuckets(current.buckets, range)
    const foldedPrevious = foldBuckets(previous.buckets, {
      from: range.previousFrom,
      to: range.previousTo,
    })

    const dailyTargetMinutes = dailyGoalTarget ?? DEFAULT_DAILY_TARGET_MINUTES
    const meetingTarget = percentageOfDaysMeetingTarget(folded.days, dailyTargetMinutes)

    const skillNames = await repository.getSkillsByIds(
      // Names for both windows so a skill that stopped recently still resolves.
      [...new Set([...folded.skills, ...foldedPrevious.skills].map((skill) => skill.skillId))],
    )
    const nameById = new Map(skillNames.map((skill) => [skill.id, skill.name]))
    const previousBySkill = new Map(
      foldedPrevious.skills.map((skill) => [skill.skillId, skill.minutes]),
    )

    const granularity = trendGranularityFor(range.days)

    const skillAnalytics: AnalyticsSkillAnalytics[] = folded.skills.map((skill) => ({
      skillId: skill.skillId,
      name: nameById.get(skill.skillId) ?? 'Unknown skill',
      totalMinutes: skill.minutes,
      percentage: percentageOf(skill.minutes, folded.totalMinutes),
      sessions: skill.sessions,
      averageSessionMinutes: average(skill.minutes, skill.sessions),
      trend: buildSkillTrend(skill.minutes, previousBySkill.get(skill.skillId) ?? 0),
    }))

    const currentSide: AnalyticsComparisonSide = {
      from: range.from,
      to: range.to,
      totalMinutes: folded.totalMinutes,
      totalSessions: folded.totalSessions,
      activeDays: folded.activeDays,
      averageDailyMinutes: average(folded.totalMinutes, folded.days.length),
    }
    const previousSide: AnalyticsComparisonSide = {
      from: range.previousFrom,
      to: range.previousTo,
      totalMinutes: foldedPrevious.totalMinutes,
      totalSessions: foldedPrevious.totalSessions,
      activeDays: foldedPrevious.activeDays,
      averageDailyMinutes: average(foldedPrevious.totalMinutes, foldedPrevious.days.length),
    }

    return {
      range: {
        kind: range.kind,
        from: range.from,
        to: range.to,
        days: range.days,
        comparisonBasis: range.comparisonBasis,
      },
      previousRange: { from: range.previousFrom, to: range.previousTo },
      timezone: timeZone,
      summary: buildSummary({
        folded,
        longest: current.longest,
        streak,
        dailyTargetMinutes,
        daysMeetingTarget: meetingTarget.daysMeetingTarget,
        percentageOfDaysMeetingTarget: meetingTarget.percentage,
        timeZone,
      }),
      skills: skillAnalytics,
      trends: { granularity, points: buildTrend(folded.days, granularity, 1) },
      comparison: {
        current: currentSide,
        previous: previousSide,
        deltas: {
          totalMinutes: compareMetrics(currentSide.totalMinutes, previousSide.totalMinutes),
          totalSessions: compareMetrics(currentSide.totalSessions, previousSide.totalSessions),
          activeDays: compareMetrics(currentSide.activeDays, previousSide.activeDays),
          averageDailyMinutes: compareMetrics(
            currentSide.averageDailyMinutes,
            previousSide.averageDailyMinutes,
          ),
        },
      },
      plans: await Promise.all(plans.map((plan) => buildPlanAnalytics(plan, timeZone, now()))),
      goals: (
        await Promise.all(
          goals.map(async (goal) => {
            const progress = await repository.goalRepository.calculateProgress(
              goal.id,
              userId,
              timeZone,
            )
            return progress === null
              ? null
              : {
                  id: goal.id,
                  period: goal.period,
                  targetMinutes: progress.targetMinutes,
                  actualMinutes: progress.actualMinutes,
                  remainingMinutes: progress.remainingMinutes,
                  percentage: progress.percentage,
                  status: progress.status,
                }
          }),
        )
      ).filter((goal): goal is AnalyticsGoal => goal !== null),
    }
  }

  async function buildPlanAnalytics(
    plan: Awaited<ReturnType<AnalyticsRepository['listActivePlans']>>[number],
    timeZone: string,
    current: Date,
  ): Promise<AnalyticsPlan> {
    const [actualMinutes, milestoneMinutes, weekly, monthly] = await Promise.all([
      repository.planRepository.getActualMinutesForPlan(plan.id),
      repository.planRepository.getActualMinutesByMilestone(plan.id),
      repository.planRepository.getWeeklyActualMinutes(
        plan.id,
        plan.startDate,
        plan.endDate,
        timeZone,
      ),
      repository.planRepository.getMonthlyActualMinutes(
        plan.id,
        plan.startDate,
        plan.endDate,
        timeZone,
      ),
    ])

    const totalDays = computeTotalDays(plan.startDate, plan.endDate, timeZone)
    const elapsedDays = computeElapsedDays(plan.startDate, current, timeZone)
    const remainingDays = computeRemainingDays(plan.endDate, current, timeZone)
    const timeProgressPercent = computeTimeProgressPercent(
      plan.startDate,
      plan.endDate,
      current,
      timeZone,
    )
    const studyProgressPercent = computeStudyProgressPercent(actualMinutes, plan.targetMinutes)

    const milestoneTotals = new Map(
      milestoneMinutes.milestones.map((entry) => [entry.milestoneId, entry.totalMinutes]),
    )

    let foundCurrent = false
    const milestones: AnalyticsPlanMilestone[] = (plan.milestones ?? []).map((milestone) => {
      const actual = milestoneTotals.get(milestone.id) ?? 0
      const isCurrent =
        !foundCurrent &&
        milestone.status === 'ACTIVE' &&
        current >= milestone.startDate &&
        current <= milestone.endDate
      const isNext =
        !foundCurrent &&
        !isCurrent &&
        milestone.status === 'ACTIVE' &&
        current < milestone.startDate
      if (isCurrent) foundCurrent = true

      return {
        milestoneId: milestone.id,
        title: milestone.title,
        status: milestone.status,
        startDate: milestone.startDate.toISOString(),
        endDate: milestone.endDate.toISOString(),
        targetMinutes: milestone.targetMinutes,
        actualMinutes: actual,
        progressPercent: computeStudyProgressPercent(actual, milestone.targetMinutes),
        remainingDays: computeRemainingDays(milestone.endDate, current, timeZone),
        isCurrent,
        isNext,
      }
    })

    return {
      planId: plan.id,
      title: plan.title,
      objectiveTitle: plan.objective?.title ?? null,
      startDate: plan.startDate.toISOString(),
      endDate: plan.endDate.toISOString(),
      targetMinutes: plan.targetMinutes,
      actualMinutes,
      remainingMinutes: Math.max(0, plan.targetMinutes - actualMinutes),
      unassignedMinutes: milestoneMinutes.unassignedMinutes,
      studyProgressPercent,
      timeProgressPercent,
      elapsedDays,
      totalDays,
      remainingDays,
      paceStatus: resolvePaceStatus({
        targetMinutes: plan.targetMinutes,
        actualMinutes,
        timeProgressPercent,
      }),
      requiredDailyMinutes: requiredDailyMinutes(plan.targetMinutes, actualMinutes, remainingDays),
      milestones,
      monthly,
      weekly,
    }
  }

  return { getAnalytics }
}

function buildSummary(input: {
  folded: ReturnType<typeof foldBuckets>
  longest: Awaited<ReturnType<AnalyticsRepository['getLongestSession']>>
  streak: StreakSummaryResponse
  dailyTargetMinutes: number
  daysMeetingTarget: number
  percentageOfDaysMeetingTarget: number
  timeZone: string
}): AnalyticsSummary {
  const { folded, longest, streak } = input
  const daysInRange = folded.days.length

  return {
    totalMinutes: folded.totalMinutes,
    totalMinutesFormatted: formatMinutes(folded.totalMinutes),
    totalSessions: folded.totalSessions,
    activeDays: folded.activeDays,
    inactiveDays: folded.inactiveDays,
    daysInRange,
    averageDailyMinutes: average(folded.totalMinutes, daysInRange),
    averageSessionMinutes: average(folded.totalMinutes, folded.totalSessions),
    longestSession: longest
      ? {
          id: longest.id,
          minutes: longest.durationMinutes,
          minutesFormatted: formatMinutes(longest.durationMinutes),
          date: todayKeyIn(input.timeZone, longest.startedAt),
          skillId: longest.skillId,
        }
      : null,
    currentStreak: streak.currentStreak,
    longestStreak: streak.longestStreak,
    qualifyingMinutes: streak.qualifyingMinutes,
    dailyTargetMinutes: input.dailyTargetMinutes,
    daysMeetingTarget: input.daysMeetingTarget,
    percentageOfDaysMeetingTarget: input.percentageOfDaysMeetingTarget,
  }
}

export type AnalyticsService = ReturnType<typeof createAnalyticsService>
