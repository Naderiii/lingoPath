import {
  addDaysToDayKey,
  dayBoundsUtc,
  diffDayKeys,
  enumerateDayKeys,
  formatDayKey,
  getDayKey,
  getDayKeyYear,
  getWeekdayIndex,
  parseDayKey,
} from '../../shared/timezone.js'

/**
 * Pure analytics logic (Phase 8): range resolution, bucketing of the aggregated
 * rows the database returns, and safe period-over-period comparisons.
 *
 * Nothing here touches Prisma or the clock — the repository supplies rows and the
 * service supplies `todayKey` — which is what makes the boundary behaviour
 * (DST days, month/year edges, leap days, zero baselines) testable.
 */

export const ANALYTICS_RANGES = [
  '7d',
  '30d',
  '90d',
  'current-year',
  'previous-year',
  'custom',
] as const

export type AnalyticsRangeKind = (typeof ANALYTICS_RANGES)[number]

/** Two years including a leap day — same cap as the calendar module. */
export const MAX_ANALYTICS_RANGE_DAYS = 731

export interface AnalyticsRange {
  kind: AnalyticsRangeKind
  /** Inclusive first local day of the current window. */
  from: string
  /** Inclusive last local day of the current window. */
  to: string
  /** Inclusive first local day of the comparison window. */
  previousFrom: string
  /** Inclusive last local day of the comparison window. */
  previousTo: string
  /** How the comparison window was chosen — surfaced to the client. */
  comparisonBasis: 'preceding-window' | 'same-period-last-year'
  /** Calendar days the current window covers (inclusive). */
  days: number
}

export interface ResolveRangeInput {
  range: AnalyticsRangeKind
  from?: string
  to?: string
  /** Today in the user's timezone. */
  todayKey: string
}

/**
 * Resolves the requested window plus the window it is compared against.
 *
 * Recorded decision: relative windows (7/30/90 days) and custom ranges compare
 * against the immediately preceding window of the same length; calendar windows
 * (`current-year`, `previous-year`) compare against the same calendar window one
 * year earlier, so "this year" is not compared against a summer-only slice.
 * Leap-day anchors clamp to the last day of the shorter month.
 */
export function resolveAnalyticsRange(input: ResolveRangeInput): AnalyticsRange {
  const { range, todayKey } = input

  switch (range) {
    case '7d':
    case '30d':
    case '90d': {
      const length = range === '7d' ? 7 : range === '30d' ? 30 : 90
      const from = addDaysToDayKey(todayKey, -(length - 1))
      const to = todayKey
      return {
        kind: range,
        from,
        to,
        previousFrom: addDaysToDayKey(from, -length),
        previousTo: addDaysToDayKey(from, -1),
        comparisonBasis: 'preceding-window',
        days: length,
      }
    }

    case 'current-year': {
      const year = getDayKeyYear(todayKey)
      const from = formatDayKey(year, 1, 1)
      const previousFrom = shiftYear(from, -1)
      const previousTo = shiftYear(todayKey, -1)
      return {
        kind: range,
        from,
        to: todayKey,
        previousFrom,
        previousTo,
        comparisonBasis: 'same-period-last-year',
        days: diffDayKeys(from, todayKey) + 1,
      }
    }

    case 'previous-year': {
      const year = getDayKeyYear(todayKey) - 1
      const from = formatDayKey(year, 1, 1)
      const to = formatDayKey(year, 12, 31)
      return {
        kind: range,
        from,
        to,
        previousFrom: formatDayKey(year - 1, 1, 1),
        previousTo: formatDayKey(year - 1, 12, 31),
        comparisonBasis: 'same-period-last-year',
        days: diffDayKeys(from, to) + 1,
      }
    }

    case 'custom': {
      const from = input.from!
      const to = input.to!
      const length = diffDayKeys(from, to) + 1
      return {
        kind: 'custom',
        from,
        to,
        previousFrom: addDaysToDayKey(from, -length),
        previousTo: addDaysToDayKey(from, -1),
        comparisonBasis: 'preceding-window',
        days: length,
      }
    }
  }
}

/** Shifts a day key back by whole years, clamping 29 Feb to 28 Feb. */
function shiftYear(dayKey: string, years: number): string {
  const { year, month, day } = parseDayKey(dayKey)
  const targetYear = year + years
  const lastDayOfMonth = new Date(Date.UTC(targetYear, month, 0)).getUTCDate()
  return formatDayKey(targetYear, month, Math.min(day, lastDayOfMonth))
}

// ─── Bucketing ───────────────────────────────────────────────────────────────

/** One (local day × skill) row as returned by the database aggregation. */
export interface DailySkillBucket {
  day: string
  skillId: string
  minutes: number
  sessions: number
}

export interface DayTotals {
  date: string
  minutes: number
  sessions: number
}

export interface SkillTotals {
  skillId: string
  minutes: number
  sessions: number
}

export interface BucketSummary {
  /** One entry per day of the window, zero-filled and chronological. */
  days: DayTotals[]
  skills: SkillTotals[]
  totalMinutes: number
  totalSessions: number
  activeDays: number
  inactiveDays: number
}

/**
 * Folds the per-day-per-skill rows into a complete daily series and per-skill
 * totals. The series is zero-filled so charts never imply missing days, and days
 * without activity are counted explicitly (`inactiveDays`).
 */
export function foldBuckets(
  buckets: readonly DailySkillBucket[],
  range: { from: string; to: string },
): BucketSummary {
  const dayKeys = enumerateDayKeys(range.from, range.to)
  const perDay = new Map<string, DayTotals>(
    dayKeys.map((date) => [date, { date, minutes: 0, sessions: 0 }]),
  )
  const perSkill = new Map<string, SkillTotals>()

  for (const bucket of buckets) {
    const day = perDay.get(bucket.day)
    if (day) {
      day.minutes += bucket.minutes
      day.sessions += bucket.sessions
    }

    const skill = perSkill.get(bucket.skillId) ?? {
      skillId: bucket.skillId,
      minutes: 0,
      sessions: 0,
    }
    skill.minutes += bucket.minutes
    skill.sessions += bucket.sessions
    perSkill.set(bucket.skillId, skill)
  }

  const days = [...perDay.values()]
  const totalMinutes = days.reduce((sum, day) => sum + day.minutes, 0)
  const totalSessions = days.reduce((sum, day) => sum + day.sessions, 0)
  const activeDays = days.filter((day) => day.minutes > 0).length

  return {
    days,
    skills: [...perSkill.values()].sort((a, b) => b.minutes - a.minutes),
    totalMinutes,
    totalSessions,
    activeDays,
    inactiveDays: days.length - activeDays,
  }
}

/** Percentage of the window's days that reached the daily target. */
export function percentageOfDaysMeetingTarget(
  days: readonly DayTotals[],
  dailyTargetMinutes: number,
): { daysMeetingTarget: number; percentage: number } {
  const threshold = Math.max(1, Math.round(dailyTargetMinutes))
  const daysMeetingTarget = days.filter((day) => day.minutes >= threshold).length
  return {
    daysMeetingTarget,
    percentage: days.length > 0 ? Math.round((daysMeetingTarget / days.length) * 100) : 0,
  }
}

export type TrendGranularity = 'day' | 'week' | 'month'

/** Day up to ~5 weeks, week up to ~4 months, month beyond that. */
export function trendGranularityFor(days: number): TrendGranularity {
  if (days <= 31) return 'day'
  if (days <= 120) return 'week'
  return 'month'
}

export interface TrendPoint {
  /** Day key for `day`, Monday day key for `week`, `YYYY-MM` for `month`. */
  bucket: string
  minutes: number
  sessions: number
}

export function buildTrend(
  days: readonly DayTotals[],
  granularity: TrendGranularity,
  weekStartsOn: 0 | 1 = 1,
): TrendPoint[] {
  const points = new Map<string, TrendPoint>()

  for (const day of days) {
    const bucket =
      granularity === 'day'
        ? day.date
        : granularity === 'month'
          ? day.date.slice(0, 7)
          : addDaysToDayKey(day.date, -((getWeekdayIndex(day.date) - weekStartsOn + 7) % 7))

    const point = points.get(bucket) ?? { bucket, minutes: 0, sessions: 0 }
    point.minutes += day.minutes
    point.sessions += day.sessions
    points.set(bucket, point)
  }

  return [...points.values()].sort((a, b) => a.bucket.localeCompare(b.bucket))
}

// ─── Comparisons ─────────────────────────────────────────────────────────────

export interface MetricDelta {
  current: number
  previous: number
  /** Signed absolute change (current − previous). */
  absolute: number
  /**
   * Percentage change, or `null` when a percentage would be misleading.
   * `zeroBaseline` distinguishes "nothing before, something now" (null + true)
   * from "nothing before and nothing now" (null + false).
   */
  changePercent: number | null
  zeroBaseline: boolean
  direction: 'up' | 'down' | 'flat'
}

export function compareMetrics(current: number, previous: number): MetricDelta {
  const absolute = current - previous
  const zeroBaseline = previous === 0

  const changePercent = zeroBaseline ? null : Math.round((absolute / previous) * 1000) / 10

  return {
    current,
    previous,
    absolute,
    changePercent,
    zeroBaseline,
    direction: absolute > 0 ? 'up' : absolute < 0 ? 'down' : 'flat',
  }
}

export interface SkillTrend {
  currentMinutes: number
  previousMinutes: number
  changePercent: number | null
  zeroBaseline: boolean
  direction: 'up' | 'down' | 'flat'
}

/**
 * Compares a skill's minutes in two windows. A skill that did not exist in the
 * previous window reports `changePercent: null` with `zeroBaseline: true`, which
 * the UI renders as "new" instead of an infinite percentage.
 */
export function buildSkillTrend(currentMinutes: number, previousMinutes: number): SkillTrend {
  const { changePercent, zeroBaseline, direction } = compareMetrics(currentMinutes, previousMinutes)

  return { currentMinutes, previousMinutes, changePercent, zeroBaseline, direction }
}

// ─── Plan pacing ─────────────────────────────────────────────────────────────

export type PaceStatus = 'ahead' | 'on-track' | 'behind' | 'not-started' | 'completed'

export interface PaceInput {
  targetMinutes: number
  actualMinutes: number
  /** Share of the plan's calendar time already elapsed (0–100). */
  timeProgressPercent: number
}

/**
 * Answers "am I keeping up with my plan?" by comparing study progress against
 * elapsed calendar time. A 10-point band counts as on-track, which keeps normal
 * week-to-week variation from flapping the label.
 */
export function resolvePaceStatus(input: PaceInput): PaceStatus {
  const { targetMinutes, actualMinutes, timeProgressPercent } = input
  if (targetMinutes <= 0) return 'not-started'
  if (actualMinutes >= targetMinutes) return 'completed'
  if (actualMinutes === 0) return 'not-started'

  const studyProgressPercent = (actualMinutes / targetMinutes) * 100
  const behindBy = timeProgressPercent - studyProgressPercent

  if (behindBy > 10) return 'behind'
  if (behindBy < -10) return 'ahead'
  return 'on-track'
}

/** Minutes per day the plan still needs, given the time left. */
export function requiredDailyMinutes(
  targetMinutes: number,
  actualMinutes: number,
  remainingDays: number,
): number {
  const remaining = Math.max(0, targetMinutes - actualMinutes)
  if (remaining === 0) return 0
  const days = Math.max(1, remainingDays)
  return Math.ceil(remaining / days)
}

/** Safe percentage: never divides by zero, never exceeds 100 unless asked. */
export function percentageOf(part: number, whole: number, cap = true): number {
  if (whole <= 0) return 0
  const value = Math.round((part / whole) * 100)
  return cap ? Math.min(100, value) : value
}

/** Average over a window, guarded against an empty window. */
export function average(total: number, count: number): number {
  if (count <= 0) return 0
  return Math.round(total / count)
}

/** Local day boundaries for a range, used to query the database. */
export function rangeToUtcWindow(
  range: { from: string; to: string },
  timeZone: string,
): { start: Date; end: Date } {
  const { start } = dayBoundsUtc(range.from, timeZone)
  const { start: endExclusive } = dayBoundsUtc(addDaysToDayKey(range.to, 1), timeZone)
  return { start, end: endExclusive }
}

export function todayKeyIn(timeZone: string, now: Date): string {
  return getDayKey(now, timeZone)
}
