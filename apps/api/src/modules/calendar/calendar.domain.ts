/**
 * Canonical study-calendar domain logic (Phase 7).
 *
 * Everything in this file is pure: no Prisma, no Clock, no I/O. That is what
 * makes the streak rules testable against the awkward cases (midnight, DST,
 * month/year boundaries, missed days) and it is why both the calendar module and
 * the sessions/dashboard modules call *these* functions instead of growing their
 * own copies. There is exactly one implementation of "what counts as a
 * qualifying day" and "how long is the current streak" in the codebase.
 *
 * Nothing here is persisted: day totals and streaks are always derived from
 * `StudySession` rows, which remain the single source of truth for study time.
 */

import type {
  CalendarBreakdownCategory,
  CalendarBreakdownSkill,
  CalendarBreakdownTopic,
  CalendarDay,
  CalendarRangeSummary,
} from '@lingopath/types'
import {
  addDaysToDayKey,
  diffDayKeys,
  getDayKey,
  isDayKey,
  parseDayKey,
} from '../../shared/timezone.js'

/**
 * Default intensity buckets, matching the product spec:
 * `0 | 1–20 | 21–40 | 41–60 | 61–90 | 90+` minutes.
 *
 * The array holds the *upper bound of each bucket above zero*; level `i` covers
 * `(thresholds[i-1], thresholds[i]]` and the last level is open-ended. With four
 * thresholds the scale has six levels (0 through 5).
 */
export const DEFAULT_INTENSITY_THRESHOLDS: number[] = [20, 40, 60, 90]

/** A day qualifies for the streak at 20 minutes of study unless configured otherwise. */
export const DEFAULT_STREAK_QUALIFYING_MINUTES = 20

/** Hard limit on configurable buckets — keeps the heatmap legend readable. */
export const MAX_INTENSITY_THRESHOLDS = 7

/** Hard limit on the qualifying threshold: one day, in minutes. */
export const MAX_STREAK_QUALIFYING_MINUTES = 24 * 60

export interface ActivitySessionLike {
  startedAt: Date
  durationMinutes: number
}

export interface DayActivity {
  totalMinutes: number
  sessionCount: number
}

export interface IntensityLevelDescriptor {
  level: number
  minMinutes: number
  maxMinutes: number | null
  label: string
}

/**
 * Sanitises user-supplied thresholds: positive integers, ascending, deduplicated,
 * capped. Anything unusable falls back to the product defaults so a bad
 * preference can never produce a broken heatmap.
 */
export function normalizeIntensityThresholds(thresholds?: readonly number[] | null): number[] {
  if (!thresholds || thresholds.length === 0) return [...DEFAULT_INTENSITY_THRESHOLDS]

  const cleaned = thresholds
    .filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => Math.round(value))

  const ascending = [...new Set(cleaned)].sort((a, b) => a - b).slice(0, MAX_INTENSITY_THRESHOLDS)

  return ascending.length > 0 ? ascending : [...DEFAULT_INTENSITY_THRESHOLDS]
}

export function normalizeQualifyingMinutes(value?: number | null): number {
  if (value === undefined || value === null || !Number.isFinite(value) || value < 0) {
    return DEFAULT_STREAK_QUALIFYING_MINUTES
  }
  return Math.min(Math.round(value), MAX_STREAK_QUALIFYING_MINUTES)
}

/** A day counts once it reaches the qualifying threshold; zero minutes never counts. */
export function isQualifyingDay(totalMinutes: number, qualifyingMinutes?: number | null): boolean {
  return totalMinutes >= Math.max(1, normalizeQualifyingMinutes(qualifyingMinutes))
}

/**
 * Maps a day's total minutes onto the configured intensity scale.
 * `0` minutes is always level `0`; the highest level is open-ended.
 */
export function resolveIntensityLevel(
  totalMinutes: number,
  thresholds: readonly number[] = DEFAULT_INTENSITY_THRESHOLDS,
): number {
  if (!(totalMinutes > 0)) return 0
  const normalized = normalizeIntensityThresholds(thresholds)
  for (let index = 0; index < normalized.length; index++) {
    if (totalMinutes <= normalized[index]!) return index + 1
  }
  return normalized.length + 1
}

/** Human-readable bucket definitions, so the UI never re-derives boundaries. */
export function describeIntensityLevels(
  thresholds: readonly number[] = DEFAULT_INTENSITY_THRESHOLDS,
): IntensityLevelDescriptor[] {
  const normalized = normalizeIntensityThresholds(thresholds)
  const levels: IntensityLevelDescriptor[] = [
    { level: 0, minMinutes: 0, maxMinutes: 0, label: 'No study' },
  ]

  normalized.forEach((max, index) => {
    levels.push({
      level: index + 1,
      minMinutes: index === 0 ? 1 : normalized[index - 1]! + 1,
      maxMinutes: max,
      label: index === 0 ? `1–${max} min` : `${normalized[index - 1]! + 1}–${max} min`,
    })
  })

  const lastBound = normalized[normalized.length - 1]!
  levels.push({
    level: normalized.length + 1,
    minMinutes: lastBound + 1,
    maxMinutes: null,
    label: `${lastBound + 1}+ min`,
  })

  return levels
}

/**
 * Buckets sessions into local calendar days.
 *
 * A session belongs to the local day its `startedAt` falls on, even when it runs
 * past midnight — the same rule the session accounting uses, so a session is
 * counted exactly once and never split.
 */
export function aggregateSessionsByDay(
  sessions: readonly ActivitySessionLike[],
  timeZone: string,
): Map<string, DayActivity> {
  const activity = new Map<string, DayActivity>()

  for (const session of sessions) {
    const dayKey = getDayKey(session.startedAt, timeZone)
    const current = activity.get(dayKey)
    if (current) {
      current.totalMinutes += session.durationMinutes
      current.sessionCount += 1
    } else {
      activity.set(dayKey, { totalMinutes: session.durationMinutes, sessionCount: 1 })
    }
  }

  return activity
}

/** Builds the heatmap cells for an explicit, ordered list of day keys. */
export function buildCalendarDays(
  dayKeys: readonly string[],
  activity: ReadonlyMap<string, DayActivity>,
  thresholds: readonly number[],
  qualifyingMinutes: number,
): CalendarDay[] {
  return dayKeys.map((date) => {
    const entry = activity.get(date)
    const totalMinutes = entry?.totalMinutes ?? 0

    return {
      date,
      totalMinutes,
      sessionCount: entry?.sessionCount ?? 0,
      intensity: resolveIntensityLevel(totalMinutes, thresholds),
      qualified: isQualifyingDay(totalMinutes, qualifyingMinutes),
    }
  })
}

export function summarizeCalendarRange(days: readonly CalendarDay[]): CalendarRangeSummary {
  let totalMinutes = 0
  let sessionCount = 0
  let activeDays = 0
  let qualifyingDays = 0
  let bestDay: CalendarRangeSummary['bestDay'] = null

  for (const day of days) {
    totalMinutes += day.totalMinutes
    sessionCount += day.sessionCount
    if (day.totalMinutes > 0) {
      activeDays += 1
      if (!bestDay || day.totalMinutes > bestDay.totalMinutes) {
        bestDay = { date: day.date, totalMinutes: day.totalMinutes }
      }
    }
    if (day.qualified) qualifyingDays += 1
  }

  return {
    totalMinutes,
    sessionCount,
    activeDays,
    qualifyingDays,
    averageMinutesPerActiveDay: activeDays > 0 ? Math.round(totalMinutes / activeDays) : 0,
    bestDay,
  }
}

export interface StreakSummary {
  currentStreak: number
  longestStreak: number
  currentStreakStart: string | null
  currentStreakEnd: string | null
  longestStreakStart: string | null
  longestStreakEnd: string | null
  todayQualified: boolean
  todayMinutes: number
  /** Today is not qualified *yet*, but the streak is still alive through yesterday. */
  todayPending: boolean
  lastQualifiedDate: string | null
  totalQualifiedDays: number
  minutesToQualifyToday: number
}

export interface StreakInput {
  /** Total minutes per local day key. Days in the future are ignored. */
  dayMinutes: ReadonlyMap<string, number>
  /** Today's day key in the user's timezone. */
  todayKey: string
  qualifyingMinutes?: number | null
}

/**
 * Computes the current and longest streaks from per-day totals.
 *
 * Rules (all derived, nothing cached):
 * - A day counts when its total minutes reach `qualifyingMinutes` (default 20).
 *   Several short sessions on the same day add up; one long session counts once.
 * - The current streak includes today when today qualifies. When today does not
 *   qualify yet, the streak is *pending* rather than broken — it keeps counting
 *   through yesterday, which is what users expect while the day is still running.
 * - Any fully missed past day ends the run. Month, year and leap-day boundaries
 *   are pure key arithmetic, so they cannot break a streak; neither can a 23-hour
 *   or 25-hour DST day, because days are keyed by local calendar date.
 * - Sessions dated in the future (clock skew, manual entry mistakes) never count.
 * - On equal-length runs the longest streak reports the earliest one.
 */
export function computeStreakSummary(input: StreakInput): StreakSummary {
  const qualifyingMinutes = normalizeQualifyingMinutes(input.qualifyingMinutes)
  const todayKey = input.todayKey

  parseDayKey(todayKey)

  const qualifiedDays: string[] = []
  for (const [dayKey, minutes] of input.dayMinutes) {
    if (!isDayKey(dayKey)) continue
    if (diffDayKeys(dayKey, todayKey) < 0) continue
    if (isQualifyingDay(minutes, qualifyingMinutes)) qualifiedDays.push(dayKey)
  }
  qualifiedDays.sort()

  let longestStreak = 0
  let longestStreakStart: string | null = null
  let longestStreakEnd: string | null = null
  let runStart: string | null = null
  let runLength = 0
  let previousDay: string | null = null

  for (const dayKey of qualifiedDays) {
    if (previousDay !== null && diffDayKeys(previousDay, dayKey) === 1) {
      runLength += 1
    } else {
      runStart = dayKey
      runLength = 1
    }

    if (runLength > longestStreak) {
      longestStreak = runLength
      longestStreakStart = runStart
      longestStreakEnd = dayKey
    }

    previousDay = dayKey
  }

  const todayMinutes = input.dayMinutes.get(todayKey) ?? 0
  const todayQualified = isQualifyingDay(todayMinutes, qualifyingMinutes)
  const qualifiedSet = new Set(qualifiedDays)

  let cursor = todayQualified ? todayKey : addDaysToDayKey(todayKey, -1)
  let currentStreak = 0
  let currentStreakEnd: string | null = null

  while (qualifiedSet.has(cursor)) {
    if (currentStreak === 0) currentStreakEnd = cursor
    currentStreak += 1
    cursor = addDaysToDayKey(cursor, -1)
  }

  const requiredToday = Math.max(1, qualifyingMinutes)

  return {
    currentStreak,
    longestStreak,
    currentStreakStart:
      currentStreak > 0 && currentStreakEnd !== null
        ? addDaysToDayKey(currentStreakEnd, -(currentStreak - 1))
        : null,
    currentStreakEnd,
    longestStreakStart,
    longestStreakEnd,
    todayQualified,
    todayMinutes,
    todayPending: !todayQualified && currentStreak > 0,
    lastQualifiedDate: qualifiedDays.length > 0 ? qualifiedDays[qualifiedDays.length - 1]! : null,
    totalQualifiedDays: qualifiedDays.length,
    minutesToQualifyToday: todayQualified ? 0 : Math.max(0, requiredToday - todayMinutes),
  }
}

/** Convenience wrapper for callers that hold raw sessions instead of day totals. */
export function computeStreakSummaryFromSessions(input: {
  sessions: readonly ActivitySessionLike[]
  timeZone: string
  todayKey: string
  qualifyingMinutes?: number | null
}): StreakSummary {
  const activity = aggregateSessionsByDay(input.sessions, input.timeZone)
  const dayMinutes = new Map<string, number>()
  for (const [dayKey, entry] of activity) dayMinutes.set(dayKey, entry.totalMinutes)

  return computeStreakSummary({
    dayMinutes,
    todayKey: input.todayKey,
    qualifyingMinutes: input.qualifyingMinutes ?? null,
  })
}

export interface BreakdownSessionLike {
  durationMinutes: number
  topic: string | null
  skill: { id: string; name: string }
  category: { id: string; name: string } | null
}

export interface DayBreakdowns {
  skills: CalendarBreakdownSkill[]
  categories: CalendarBreakdownCategory[]
  topics: CalendarBreakdownTopic[]
}

/**
 * Per-day distribution across skills, categories and topics — the substance of
 * the "click a day" drill-down. `topics` only lists sessions that actually carry
 * a topic; the untitled remainder stays visible because the percentages are
 * computed against the day's full total.
 */
export function buildDayBreakdowns(sessions: readonly BreakdownSessionLike[]): DayBreakdowns {
  const totalMinutes = sessions.reduce((sum, session) => sum + session.durationMinutes, 0)

  const skills = new Map<string, { name: string; minutes: number; sessionCount: number }>()
  const categories = new Map<
    string,
    { id: string | null; name: string; minutes: number; sessionCount: number }
  >()
  const topics = new Map<string, { minutes: number; sessionCount: number }>()

  for (const session of sessions) {
    const skill = skills.get(session.skill.id)
    if (skill) {
      skill.minutes += session.durationMinutes
      skill.sessionCount += 1
    } else {
      skills.set(session.skill.id, {
        name: session.skill.name,
        minutes: session.durationMinutes,
        sessionCount: 1,
      })
    }

    const categoryKey = session.category?.id ?? '__uncategorised__'
    const category = categories.get(categoryKey)
    if (category) {
      category.minutes += session.durationMinutes
      category.sessionCount += 1
    } else {
      categories.set(categoryKey, {
        id: session.category?.id ?? null,
        name: session.category?.name ?? 'Uncategorised',
        minutes: session.durationMinutes,
        sessionCount: 1,
      })
    }

    const topic = session.topic?.trim()
    if (topic) {
      const entry = topics.get(topic)
      if (entry) {
        entry.minutes += session.durationMinutes
        entry.sessionCount += 1
      } else {
        topics.set(topic, { minutes: session.durationMinutes, sessionCount: 1 })
      }
    }
  }

  const percentage = (minutes: number): number =>
    totalMinutes > 0 ? Math.round((minutes / totalMinutes) * 100) : 0

  return {
    skills: [...skills.entries()]
      .map(([skillId, entry]) => ({
        skillId,
        name: entry.name,
        minutes: entry.minutes,
        sessionCount: entry.sessionCount,
        percentage: percentage(entry.minutes),
      }))
      .sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name)),
    categories: [...categories.values()]
      .map((entry) => ({
        categoryId: entry.id,
        name: entry.name,
        minutes: entry.minutes,
        sessionCount: entry.sessionCount,
        percentage: percentage(entry.minutes),
      }))
      .sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name)),
    topics: [...topics.entries()]
      .map(([topic, entry]) => ({
        topic,
        minutes: entry.minutes,
        sessionCount: entry.sessionCount,
        percentage: percentage(entry.minutes),
      }))
      .sort((a, b) => b.minutes - a.minutes || a.topic.localeCompare(b.topic)),
  }
}
