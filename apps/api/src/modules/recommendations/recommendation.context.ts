/**
 * The controlled recommendation context (Phase 10).
 *
 * This file defines the *only* shape of learner data the recommendation engine is
 * allowed to see. It is deliberately narrow, and narrow for a reason: everything
 * below is an already-aggregated fact, so the engine — and, through it, an LLM —
 * can reason about pace and balance without ever receiving a raw `StudySession`
 * row, a free-text note, a topic, a display name or a timezone.
 *
 * The context is built by pure code (`buildRecommendationContext`) from data the
 * aggregation service fetched. That separation is what makes every reasoning rule
 * testable without a database: tests hand this file a `RecommendationRawData`
 * object and assert on the resulting context.
 *
 * Three boundaries are load-bearing:
 *
 * 1. **Aggregates, never rows.** `skills` carries minutes and session counts;
 *    there is no list of sessions to inspect. A recommendation can therefore never
 *    quote a session a learner would recognise, and the payload size is bounded by
 *    the skill taxonomy rather than by study history.
 * 2. **Recorded ability is separate from practice.** `assessment` holds the CEFR
 *    levels the learner recorded; `activity` holds what they did. Nothing here
 *    merges the two, so "low recent practice" cannot be mistaken for "weak
 *    ability" downstream.
 * 3. **No identity.** `userId`, `displayName` and `timezone` are not part of the
 *    context. Day keys are already resolved when it is built, and user-authored
 *    text (topics, notes, plan titles) is never fetched into it.
 */

import type {
  AssessmentMethod,
  CefrLevel,
  GoalPeriod,
  LevelDimension,
  ObjectiveType,
  RecommendationAction,
  RecommendationType,
} from '@lingopath/types'
import { buildCurrentSnapshots } from '../assessments/level.domain.js'
import {
  requiredDailyMinutes,
  resolvePaceStatus,
  type DailySkillBucket,
  type PaceStatus,
} from '../analytics/analytics.domain.js'
import {
  computeRemainingDays,
  computeStudyProgressPercent,
  computeTimeProgressPercent,
} from '../plans/plan.service.js'
import { addDaysToDayKey, diffDayKeys, getDayKey } from '../../shared/timezone.js'

export type ConfidenceLevel = 'LOW' | 'MEDIUM' | 'HIGH'

/** Length of each comparison window; recent + prior therefore span 28 days. */
export const RECENT_WINDOW_DAYS = 14

export interface ActivityWindowStats {
  days: number
  minutes: number
  sessions: number
  activeDays: number
}

export interface ContextObjective {
  id: string
  type: ObjectiveType
  targetScore: number | null
  /** Day key (`YYYY-MM-DD`) in the learner's timezone. */
  targetDate: string | null
  daysUntilTargetDate: number | null
}

export interface ContextSkill {
  id: string
  name: string
  totalMinutes: number
  totalSessions: number
  recentMinutes: number
  recentSessions: number
  priorMinutes: number
  /** Share of all recorded study minutes (0–1). */
  share: number
  lastPracticedDaysAgo: number | null
  /** Named by an active goal's skill target, i.e. an intention the learner set. */
  referencedByGoal: boolean
  /** Named by a milestone of an active plan. */
  referencedByPlan: boolean
}

export interface ContextGoal {
  id: string
  period: GoalPeriod
  targetMinutes: number
  actualMinutes: number
  percentage: number
  status: string
  /** Day key the goal started, in the learner's timezone. */
  startedOn: string
  planId: string | null
  objectiveId: string | null
  skillTargets: Array<{ skillId: string; targetMinutes: number; actualMinutes: number }>
}

export interface ContextGoalCompletion {
  /** Days in the recent window that are being judged. */
  trackedDays: number
  daysMeetingTarget: number
  dailyTargetMinutes: number | null
  /** 0–100, or `null` when there is no daily target to judge against. */
  rate: number | null
  /** Minutes per day actually studied on the days that had any study time. */
  averageActiveDayMinutes: number
}

export interface ContextMilestone {
  id: string
  targetMinutes: number
  actualMinutes: number
  progressPercent: number
  remainingDays: number
  skillId: string | null
}

export interface ContextPlan {
  id: string
  targetMinutes: number
  actualMinutes: number
  studyProgressPercent: number
  timeProgressPercent: number
  remainingDays: number
  paceStatus: PaceStatus
  requiredDailyMinutes: number
  currentMilestone: ContextMilestone | null
}

export interface ContextAssessment {
  recorded: boolean
  assessedOn: string | null
  method: AssessmentMethod | null
  /** Newest *recorded* level per dimension — never an estimate. */
  levels: Record<LevelDimension, CefrLevel | null>
}

export interface ContextExamResult {
  /** Whole days since the result was recorded; 0 means today. */
  takenDaysAgo: number
  isMock: boolean
  overallScore: number | null
  skillScores: Record<string, number>
}

export interface ContextExam {
  id: string
  type: string
  status: string
  /** Days until the next future scheduled/target date, or `null` when none. */
  daysUntil: number | null
  targetScore: number | null
  latestResult: ContextExamResult | null
}

export interface ContextFeedback {
  type: RecommendationType
  action: RecommendationAction
  evidenceKey: string | null
  objectiveId: string | null
  decidedAt: string
  daysAgo: number
}

export interface ContextActivity {
  windowDays: number
  recent: ActivityWindowStats
  prior: ActivityWindowStats
  lifetime: {
    minutes: number
    sessions: number
    activeDays: number
    firstSessionDay: string | null
  }
  currentStreak: number
  longestStreak: number
  lastSessionDaysAgo: number | null
  averageSessionMinutes: number | null
  /** Median session length: the learner's natural block size, not a target. */
  medianSessionMinutes: number | null
  /** Most common local start hour, when the history is long enough to have one. */
  preferredStartHour: number | null
}

export interface RecommendationContext {
  /** ISO timestamp of the snapshot. */
  generatedAt: string
  /** Day key in the learner's timezone. */
  today: string
  objective: ContextObjective | null
  hasAnyObjective: boolean
  activity: ContextActivity
  skills: ContextSkill[]
  goals: ContextGoal[]
  goalCompletion: ContextGoalCompletion
  plans: ContextPlan[]
  assessment: ContextAssessment
  exams: ContextExam[]
  feedback: ContextFeedback[]
}

// ─── Raw input (what the aggregation service fetched) ────────────────────────

export interface RawSkill {
  id: string
  name: string
}

export interface RawLifetimeSummary {
  minutes: number
  sessions: number
  activeDays: number
  firstStartedAt: Date | null
  lastStartedAt: Date | null
}

export interface RawSkillTotal {
  skillId: string
  minutes: number
  sessions: number
}

export interface RawSkillRecency {
  skillId: string
  lastStartedAt: Date
}

/**
 * Session-shape facts the database computes, not raw durations: a median and a
 * modal start hour are all the engine needs, and neither can reconstruct a
 * session.
 */
export interface RawSessionPattern {
  medianMinutes: number | null
  preferredStartHour: number | null
}

export interface RawGoalProgress {
  targetMinutes: number
  actualMinutes: number
  percentage: number
  status: string
  skillProgress: Array<{ skillId: string; targetMinutes: number; actualMinutes: number }>
}

export interface RawGoal {
  id: string
  period: GoalPeriod
  /** First day the goal is in force; bounds how much history can be judged. */
  startDate: Date
  planId: string | null
  objectiveId: string | null
  progress: RawGoalProgress
}

export interface RawMilestone {
  id: string
  startDate: Date
  endDate: Date
  targetMinutes: number
  actualMinutes: number
  status: string
  skillId: string | null
}

export interface RawPlan {
  id: string
  startDate: Date
  endDate: Date
  targetMinutes: number
  actualMinutes: number
  milestones: RawMilestone[]
}

export interface RawAssessment {
  id: string
  assessedAt: Date
  method: AssessmentMethod
  cefrLevel: CefrLevel | null
  listeningLevel: CefrLevel | null
  readingLevel: CefrLevel | null
  writingLevel: CefrLevel | null
  speakingLevel: CefrLevel | null
}

export interface RawExamResult {
  takenAt: Date
  isMock: boolean
  overallScore: number | null
  skillScores: Record<string, number>
}

export interface RawExam {
  id: string
  type: string
  status: string
  scheduledAt: Date | null
  targetDate: Date | null
  targetScore: number | null
  /** Newest first. */
  results: RawExamResult[]
}

export interface RawFeedback {
  type: RecommendationType
  action: RecommendationAction
  evidenceKey: string | null
  objectiveId: string | null
  decidedAt: Date
}

export interface RawObjective {
  id: string
  type: ObjectiveType
  targetScore: number | null
  targetDate: Date | null
}

export interface RecommendationRawData {
  now: Date
  timezone: string
  objective: RawObjective | null
  hasAnyObjective: boolean
  lifetime: RawLifetimeSummary
  /** Per-skill all-time totals, aggregated in SQL. */
  skillTotals: readonly RawSkillTotal[]
  /** Aggregated per local day × skill for the recent + prior windows. */
  buckets: readonly DailySkillBucket[]
  skillRecency: readonly RawSkillRecency[]
  sessionPattern: RawSessionPattern
  skills: readonly RawSkill[]
  goals: readonly RawGoal[]
  plans: readonly RawPlan[]
  assessments: readonly RawAssessment[]
  exams: readonly RawExam[]
  feedback: readonly RawFeedback[]
  streak: { currentStreak: number; longestStreak: number }
}

// ─── Builder ─────────────────────────────────────────────────────────────────

function daysAgoFrom(from: Date | null, today: string, timeZone: string): number | null {
  if (from === null) return null
  return diffDayKeys(getDayKey(from, timeZone), today)
}

function summarizeWindow(
  buckets: readonly DailySkillBucket[],
  dayKeySet: ReadonlySet<string>,
  days: number,
): ActivityWindowStats {
  let minutes = 0
  let sessions = 0
  const activeDays = new Set<string>()

  for (const bucket of buckets) {
    if (!dayKeySet.has(bucket.day)) continue
    minutes += bucket.minutes
    sessions += bucket.sessions
    if (bucket.minutes > 0) activeDays.add(bucket.day)
  }

  return { days, minutes, sessions, activeDays: activeDays.size }
}

function countDaysMeetingTarget(
  buckets: readonly DailySkillBucket[],
  dayKeys: ReadonlySet<string>,
  targetMinutes: number,
): number {
  const perDay = new Map<string, number>()
  for (const bucket of buckets) {
    if (!dayKeys.has(bucket.day)) continue
    perDay.set(bucket.day, (perDay.get(bucket.day) ?? 0) + bucket.minutes)
  }

  const threshold = Math.max(1, targetMinutes)
  let count = 0
  for (const minutes of perDay.values()) {
    if (minutes >= threshold) count++
  }
  return count
}

function pickCurrentMilestone(milestones: readonly RawMilestone[], now: Date): RawMilestone | null {
  const active = milestones.filter((milestone) => milestone.status === 'ACTIVE')
  const current = active.find((milestone) => now >= milestone.startDate && now <= milestone.endDate)
  if (current) return current

  return (
    active
      .filter((milestone) => milestone.startDate > now)
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())[0] ?? null
  )
}

function buildAssessmentContext(
  assessments: readonly RawAssessment[],
  timeZone: string,
): ContextAssessment {
  if (assessments.length === 0) {
    return {
      recorded: false,
      assessedOn: null,
      method: null,
      levels: { overall: null, listening: null, reading: null, writing: null, speaking: null },
    }
  }

  // Reuses the Phase 9 rule verbatim: the level shown for a dimension is the one
  // from the newest assessment that actually recorded that dimension.
  const snapshots = buildCurrentSnapshots([...assessments])
  const newest = [...assessments].sort((a, b) => b.assessedAt.getTime() - a.assessedAt.getTime())[0]

  return {
    recorded: true,
    assessedOn: newest ? getDayKey(newest.assessedAt, timeZone) : null,
    method: newest?.method ?? null,
    levels: {
      overall: snapshots.overall?.level ?? null,
      listening: snapshots.listening?.level ?? null,
      reading: snapshots.reading?.level ?? null,
      writing: snapshots.writing?.level ?? null,
      speaking: snapshots.speaking?.level ?? null,
    },
  }
}

/**
 * Turns aggregated rows into the context every later stage reasons over.
 *
 * Pure: no clock, no database, no formatting beyond day keys. The caller decides
 * "today"; this function only does arithmetic.
 */
export function buildRecommendationContext(raw: RecommendationRawData): RecommendationContext {
  const { now, timezone, lifetime } = raw
  const today = getDayKey(now, timezone)

  const recentDays = new Set<string>()
  const priorDays = new Set<string>()
  for (let offset = 0; offset < RECENT_WINDOW_DAYS; offset++) {
    recentDays.add(addDaysToDayKey(today, -offset))
    priorDays.add(addDaysToDayKey(today, -offset - RECENT_WINDOW_DAYS))
  }

  const recent = summarizeWindow(raw.buckets, recentDays, RECENT_WINDOW_DAYS)
  const prior = summarizeWindow(raw.buckets, priorDays, RECENT_WINDOW_DAYS)

  // Goals attached to a different, non-active objective describe preparation the
  // learner has moved away from. With an active objective they are excluded, so two
  // goals for two objectives are not reported as one conflict. With no active
  // objective there is no focus to compare against, so every goal stays in scope.
  const activeObjectiveId = raw.objective?.id ?? null
  const scopedGoals =
    activeObjectiveId === null
      ? raw.goals
      : raw.goals.filter(
          (goal) => goal.objectiveId === null || goal.objectiveId === activeObjectiveId,
        )

  // ── Skills ────────────────────────────────────────────────────────────────
  const recencyById = new Map(raw.skillRecency.map((entry) => [entry.skillId, entry.lastStartedAt]))
  const totalById = new Map(raw.skillTotals.map((entry) => [entry.skillId, entry]))
  const goalSkillIds = new Set(
    scopedGoals.flatMap((goal) => goal.progress.skillProgress.map((target) => target.skillId)),
  )
  const planSkillIds = new Set(
    raw.plans.flatMap((plan) =>
      plan.milestones.flatMap((milestone) => (milestone.skillId ? [milestone.skillId] : [])),
    ),
  )

  const windowed = new Map<
    string,
    { recentMinutes: number; recentSessions: number; priorMinutes: number }
  >()
  for (const bucket of raw.buckets) {
    const entry = windowed.get(bucket.skillId) ?? {
      recentMinutes: 0,
      recentSessions: 0,
      priorMinutes: 0,
    }
    if (recentDays.has(bucket.day)) {
      entry.recentMinutes += bucket.minutes
      entry.recentSessions += bucket.sessions
    } else if (priorDays.has(bucket.day)) {
      entry.priorMinutes += bucket.minutes
    }
    windowed.set(bucket.skillId, entry)
  }

  const totalMinutes = lifetime.minutes
  const skills: ContextSkill[] = raw.skills
    .map((skill) => {
      const totals = totalById.get(skill.id)
      const window = windowed.get(skill.id)
      const skillMinutes = totals?.minutes ?? 0
      return {
        id: skill.id,
        name: skill.name,
        totalMinutes: skillMinutes,
        totalSessions: totals?.sessions ?? 0,
        recentMinutes: window?.recentMinutes ?? 0,
        recentSessions: window?.recentSessions ?? 0,
        priorMinutes: window?.priorMinutes ?? 0,
        share: totalMinutes > 0 ? skillMinutes / totalMinutes : 0,
        lastPracticedDaysAgo: daysAgoFrom(recencyById.get(skill.id) ?? null, today, timezone),
        referencedByGoal: goalSkillIds.has(skill.id),
        referencedByPlan: planSkillIds.has(skill.id),
      }
    })
    .sort((a, b) => b.totalMinutes - a.totalMinutes)

  // ── Goals ─────────────────────────────────────────────────────────────────
  const goals: ContextGoal[] = scopedGoals.map((goal) => ({
    id: goal.id,
    period: goal.period,
    targetMinutes: goal.progress.targetMinutes,
    actualMinutes: goal.progress.actualMinutes,
    percentage: goal.progress.percentage,
    status: goal.progress.status,
    startedOn: getDayKey(goal.startDate, timezone),
    planId: goal.planId,
    objectiveId: goal.objectiveId,
    skillTargets: goal.progress.skillProgress.map((target) => ({
      skillId: target.skillId,
      targetMinutes: target.targetMinutes,
      actualMinutes: target.actualMinutes,
    })),
  }))

  const dailyGoal = goals.find((goal) => goal.period === 'DAILY')
  const dailyTargetMinutes = dailyGoal?.targetMinutes ?? null

  // Only the days the goal has actually been in force can be judged. A target set
  // yesterday has no fourteen-day completion rate, and pretending it does invents
  // fourteen days of failure.
  const goalAgeDays =
    dailyGoal === undefined
      ? RECENT_WINDOW_DAYS
      : Math.max(1, diffDayKeys(dailyGoal.startedOn, today) + 1)
  const trackedDays =
    dailyGoal === undefined ? recent.days : Math.min(RECENT_WINDOW_DAYS, goalAgeDays)

  const judgedDays = new Set<string>()
  for (let offset = 0; offset < trackedDays; offset++) {
    judgedDays.add(addDaysToDayKey(today, -offset))
  }

  const daysMeetingTarget =
    dailyTargetMinutes === null
      ? 0
      : countDaysMeetingTarget(raw.buckets, judgedDays, dailyTargetMinutes)

  const goalCompletion: ContextGoalCompletion = {
    trackedDays,
    daysMeetingTarget,
    dailyTargetMinutes,
    rate:
      dailyTargetMinutes === null
        ? null
        : Math.round((daysMeetingTarget / Math.max(1, trackedDays)) * 100),
    averageActiveDayMinutes:
      recent.activeDays > 0 ? Math.round(recent.minutes / recent.activeDays) : 0,
  }

  // ── Plans ─────────────────────────────────────────────────────────────────
  const plans: ContextPlan[] = raw.plans.map((plan) => {
    const timeProgressPercent = computeTimeProgressPercent(
      plan.startDate,
      plan.endDate,
      now,
      timezone,
    )
    const remainingDays = computeRemainingDays(plan.endDate, now, timezone)
    const current = pickCurrentMilestone(plan.milestones, now)

    return {
      id: plan.id,
      targetMinutes: plan.targetMinutes,
      actualMinutes: plan.actualMinutes,
      studyProgressPercent: computeStudyProgressPercent(plan.actualMinutes, plan.targetMinutes),
      timeProgressPercent,
      remainingDays,
      paceStatus: resolvePaceStatus({
        targetMinutes: plan.targetMinutes,
        actualMinutes: plan.actualMinutes,
        timeProgressPercent,
      }),
      requiredDailyMinutes: requiredDailyMinutes(
        plan.targetMinutes,
        plan.actualMinutes,
        remainingDays,
      ),
      currentMilestone: current
        ? {
            id: current.id,
            targetMinutes: current.targetMinutes,
            actualMinutes: current.actualMinutes,
            progressPercent: computeStudyProgressPercent(
              current.actualMinutes,
              current.targetMinutes,
            ),
            remainingDays: computeRemainingDays(current.endDate, now, timezone),
            skillId: current.skillId,
          }
        : null,
    }
  })

  // ── Exams ─────────────────────────────────────────────────────────────────
  const exams: ContextExam[] = raw.exams.map((exam) => {
    const latest = exam.results[0] ?? null
    const upcoming = [exam.scheduledAt, exam.targetDate]
      .filter((value): value is Date => value !== null)
      .map((value) => getDayKey(value, timezone))
      .map((dayKey) => diffDayKeys(today, dayKey))
      .filter((delta) => delta >= 0)
      .sort((a, b) => a - b)[0]

    return {
      id: exam.id,
      type: exam.type,
      status: exam.status,
      daysUntil: upcoming ?? null,
      targetScore: exam.targetScore,
      latestResult: latest
        ? {
            takenDaysAgo: diffDayKeys(getDayKey(latest.takenAt, timezone), today),
            isMock: latest.isMock,
            overallScore: latest.overallScore,
            skillScores: latest.skillScores,
          }
        : null,
    }
  })

  // ── Feedback ──────────────────────────────────────────────────────────────
  const feedback: ContextFeedback[] = raw.feedback.map((entry) => ({
    type: entry.type,
    action: entry.action,
    evidenceKey: entry.evidenceKey,
    objectiveId: entry.objectiveId,
    decidedAt: entry.decidedAt.toISOString(),
    daysAgo: diffDayKeys(getDayKey(entry.decidedAt, timezone), today),
  }))

  return {
    generatedAt: now.toISOString(),
    today,
    objective: raw.objective
      ? {
          id: raw.objective.id,
          type: raw.objective.type,
          targetScore: raw.objective.targetScore,
          targetDate: raw.objective.targetDate
            ? getDayKey(raw.objective.targetDate, timezone)
            : null,
          daysUntilTargetDate: raw.objective.targetDate
            ? diffDayKeys(today, getDayKey(raw.objective.targetDate, timezone))
            : null,
        }
      : null,
    hasAnyObjective: raw.hasAnyObjective,
    activity: {
      windowDays: RECENT_WINDOW_DAYS,
      recent,
      prior,
      lifetime: {
        minutes: lifetime.minutes,
        sessions: lifetime.sessions,
        activeDays: lifetime.activeDays,
        firstSessionDay: lifetime.firstStartedAt
          ? getDayKey(lifetime.firstStartedAt, timezone)
          : null,
      },
      currentStreak: raw.streak.currentStreak,
      longestStreak: raw.streak.longestStreak,
      lastSessionDaysAgo: daysAgoFrom(lifetime.lastStartedAt, today, timezone),
      averageSessionMinutes:
        lifetime.sessions > 0 ? Math.round(lifetime.minutes / lifetime.sessions) : null,
      medianSessionMinutes: raw.sessionPattern.medianMinutes,
      preferredStartHour: raw.sessionPattern.preferredStartHour,
    },
    skills,
    goals,
    goalCompletion,
    plans,
    assessment: buildAssessmentContext(raw.assessments, timezone),
    exams,
    feedback,
  }
}
