import type {
  AnalyticsMetricDelta,
  AnalyticsPlan,
  AnalyticsRangeKind,
  AnalyticsTrendPoint,
} from '@lingopath/types'

/**
 * Pure presentation helpers for the analytics page. The API already resolved every
 * range, bucket and percentage; this module only turns those numbers into labels
 * and chart-ready series, and it is careful not to invent figures where the
 * comparison is meaningless (zero baseline).
 */

export interface RangeOption {
  value: AnalyticsRangeKind
  label: string
  description: string
}

export const RANGE_OPTIONS: RangeOption[] = [
  { value: '7d', label: '7 days', description: 'Last 7 days' },
  { value: '30d', label: '30 days', description: 'Last 30 days' },
  { value: '90d', label: '90 days', description: 'Last 90 days' },
  { value: 'current-year', label: 'This year', description: 'Year to date' },
  { value: 'previous-year', label: 'Last year', description: 'Previous calendar year' },
  { value: 'custom', label: 'Custom range', description: 'Pick any window up to two years' },
]

export function rangeParamFor(
  option: AnalyticsRangeKind,
): Partial<Record<'range', AnalyticsRangeKind>> {
  return { range: option }
}

/** `1h 20m` from minutes — matches the rest of the app's formatting. */
export function formatMinutes(minutes: number): string {
  if (minutes <= 0) return '0m'
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest}m`
  if (rest === 0) return `${hours}h`
  return `${hours}h ${rest}m`
}

/**
 * Human description of a change. Zero baselines are reported as "New" rather
 * than an infinite percentage, and an unchanged zero stays "No change".
 */
export function describeDelta(delta: AnalyticsMetricDelta): string {
  if (delta.changePercent !== null) {
    const sign = delta.changePercent > 0 ? '+' : ''
    return `${sign}${delta.changePercent}%`
  }

  if (delta.zeroBaseline && delta.current > 0) return 'New'
  if (delta.absolute === 0) return 'No change'
  return delta.absolute > 0 ? 'Up' : 'Down'
}

export function deltaTone(delta: AnalyticsMetricDelta): 'positive' | 'negative' | 'neutral' {
  if (delta.direction === 'up') return 'positive'
  if (delta.direction === 'down') return 'negative'
  return 'neutral'
}

/** `Jul 19 – Oct 16, 2026` without depending on the runtime locale. */
export function formatRangeLabel(from: string, to: string): string {
  const [fromYear, fromMonth, fromDay] = from.split('-').map(Number)
  const [toYear, toMonth, toDay] = to.split('-').map(Number)
  const monthNames = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ]

  const fromLabel = `${monthNames[(fromMonth ?? 1) - 1]} ${fromDay}`
  const toLabel = `${monthNames[(toMonth ?? 1) - 1]} ${toDay}`

  if (fromYear === toYear) return `${fromLabel} – ${toLabel}, ${toYear}`
  return `${fromLabel}, ${fromYear} – ${toLabel}, ${toYear}`
}

export function formatBucketLabel(bucket: string, granularity: 'day' | 'week' | 'month'): string {
  const monthNames = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ]

  if (granularity === 'month') {
    const [year, month] = bucket.split('-').map(Number)
    return `${monthNames[(month ?? 1) - 1]} ${year}`
  }

  const [year, month, day] = bucket.split('-').map(Number)
  const label = `${monthNames[(month ?? 1) - 1]} ${day}`
  return granularity === 'week' ? `Week of ${label}` : `${label}, ${year}`
}

export interface ChartPoint {
  bucket: string
  label: string
  minutes: number
  hours: number
  sessions: number
}

/** Chart-ready series; values are rounded for display only. */
export function toChartPoints(
  points: readonly AnalyticsTrendPoint[],
  granularity: 'day' | 'week' | 'month',
): ChartPoint[] {
  return points.map((point) => ({
    bucket: point.bucket,
    label: formatBucketLabel(point.bucket, granularity),
    minutes: point.minutes,
    hours: Math.round((point.minutes / 60) * 10) / 10,
    sessions: point.sessions,
  }))
}

/**
 * Y-axis ceiling so an all-zero series does not render as a degenerate chart and
 * a single tall bar does not dwarf the rest.
 */
export function chartDomainMax(points: readonly ChartPoint[]): number {
  const max = points.reduce((peak, point) => Math.max(peak, point.minutes), 0)
  if (max <= 0) return 60
  return Math.ceil((max * 1.1) / 30) * 30
}

export const PACE_LABELS: Record<AnalyticsPlan['paceStatus'], string> = {
  ahead: 'Ahead of plan',
  'on-track': 'On track',
  behind: 'Behind plan',
  'not-started': 'Not started',
  completed: 'Target reached',
}

export function paceTone(status: AnalyticsPlan['paceStatus']): 'positive' | 'negative' | 'neutral' {
  if (status === 'ahead' || status === 'completed') return 'positive'
  if (status === 'behind') return 'negative'
  return 'neutral'
}

/** One-line answer to "am I keeping up with this plan?". */
export function describePace(plan: AnalyticsPlan): string {
  if (plan.paceStatus === 'completed') return 'Target reached — every remaining minute is a bonus.'
  if (plan.paceStatus === 'not-started') {
    return `No study logged yet · ${formatMinutes(plan.requiredDailyMinutes)}/day needed to finish on time.`
  }

  const gap = Math.round((plan.timeProgressPercent - plan.studyProgressPercent) * 10) / 10
  const rounded = Math.abs(gap)
  if (plan.paceStatus === 'on-track') {
    return `${plan.timeProgressPercent}% of the calendar has passed and ${plan.studyProgressPercent}% of the target is done — on track.`
  }
  if (gap > 0) {
    return `${rounded} points behind the calendar pace · ${formatMinutes(plan.requiredDailyMinutes)}/day to catch up.`
  }
  return `${rounded} points ahead of the calendar pace.`
}

/** Plan month series for charts, labelled with the local month name. */
export function toPlanMonthPoints(months: readonly { month: string; totalMinutes: number }[]) {
  return months.map((entry) => ({
    ...entry,
    label: formatBucketLabel(`${entry.month}-01`, 'month'),
    hours: Math.round((entry.totalMinutes / 60) * 10) / 10,
  }))
}

export function toPlanWeekPoints(weeks: readonly { weekStart: string; totalMinutes: number }[]) {
  return weeks.map((entry) => ({
    ...entry,
    // Short axis label (`Oct 12`) rather than the full date with year.
    label: formatBucketLabel(entry.weekStart, 'week').replace('Week of ', ''),
    hours: Math.round((entry.totalMinutes / 60) * 10) / 10,
  }))
}

const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function isRealDayKey(value: string): boolean {
  if (!DAY_KEY_PATTERN.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const roundTrip = new Date(Date.UTC(year!, month! - 1, day!))
  return (
    roundTrip.getUTCFullYear() === year &&
    roundTrip.getUTCMonth() + 1 === month &&
    roundTrip.getUTCDate() === day
  )
}

/** Whole days between two keys (calendar arithmetic only). */
export function diffDayKeys(from: string, to: string): number {
  const [fromYear, fromMonth, fromDay] = from.split('-').map(Number)
  const [toYear, toMonth, toDay] = to.split('-').map(Number)
  return Math.round(
    (Date.UTC(toYear!, toMonth! - 1, toDay!) - Date.UTC(fromYear!, fromMonth! - 1, fromDay!)) /
      86_400_000,
  )
}

/**
 * Mirrors the server's rules for a custom range so the form can explain the
 * problem instead of firing a request that will 422.
 */
export function validateRangeInputs(from: string, to: string): string | null {
  if (!from || !to) return 'Pick both a start and an end date.'
  if (!isRealDayKey(from) || !isRealDayKey(to)) return 'Dates must look like YYYY-MM-DD.'
  if (from > to) return 'The start date must not be after the end date.'
  if (diffDayKeys(from, to) + 1 > 731) return 'Custom ranges are limited to two years.'
  return null
}

/** `% of days meeting goal` as a percentage bar value, clamped for display. */
export function targetCoveragePercent(percentage: number): number {
  return Math.max(0, Math.min(100, Math.round(percentage)))
}
