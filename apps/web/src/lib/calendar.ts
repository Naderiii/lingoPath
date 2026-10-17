import type { CalendarDay, CalendarIntensityLevel, CalendarRange } from '@lingopath/types'

/**
 * Pure display helpers for the study calendar.
 *
 * Date maths here works on `YYYY-MM-DD` day keys through UTC arithmetic only —
 * never `new Date(dayKey)`, which parses as UTC midnight and then renders in the
 * browser's timezone, shifting the date by a day for anyone west of UTC. The
 * server already resolved every day key in the *user's* configured timezone, so
 * the client's job is to lay those keys out without touching them.
 */

export const MONTH_LABELS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

export const MONTH_SHORT_LABELS = [
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
] as const

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

export const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export type WeekStartsOn = 0 | 1

export interface HeatmapCell {
  date: string
  /** `null` for the leading/trailing padding cells of a partial week. */
  day: CalendarDay | null
}

export interface HeatmapColumnLabel {
  columnIndex: number
  label: string
}

/** `1`–`5` (or however many buckets are configured), `0` for a day with no study. */
export function intensityClass(level: number): string {
  switch (Math.max(0, Math.round(level))) {
    case 0:
      return 'bg-muted/40 hover:bg-muted/60'
    case 1:
      return 'bg-primary/20 hover:bg-primary/30'
    case 2:
      return 'bg-primary/40 hover:bg-primary/50'
    case 3:
      return 'bg-primary/60 hover:bg-primary/70'
    case 4:
      return 'bg-primary/80 hover:bg-primary/90'
    default:
      return 'bg-primary hover:bg-primary-hover'
  }
}

export function parseDayKeyParts(dayKey: string): { year: number; month: number; day: number } {
  const [year, month, day] = dayKey.split('-').map(Number)
  return { year: year ?? 0, month: month ?? 1, day: day ?? 1 }
}

export function formatDayKey(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function addDaysToKey(dayKey: string, days: number): string {
  const { year, month, day } = parseDayKeyParts(dayKey)
  const shifted = new Date(Date.UTC(year, month - 1, day) + days * 86_400_000)
  return formatDayKey(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate())
}

/** Whole days from `from` to `to`. */
export function diffDayKeys(from: string, to: string): number {
  const a = parseDayKeyParts(from)
  const b = parseDayKeyParts(to)
  return Math.round(
    (Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86_400_000,
  )
}

/** `0` = Sunday … `6` = Saturday. */
export function weekdayIndex(dayKey: string): number {
  const { year, month, day } = parseDayKeyParts(dayKey)
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

export function isDayKeyLike(value: string): boolean {
  if (!DAY_KEY_PATTERN.test(value)) return false
  const { year, month, day } = parseDayKeyParts(value)
  const roundTrip = new Date(Date.UTC(year, month - 1, day))
  return (
    roundTrip.getUTCFullYear() === year &&
    roundTrip.getUTCMonth() + 1 === month &&
    roundTrip.getUTCDate() === day
  )
}

/** `Fri, Oct 16, 2026` — spelled out from parts, never from a Date. */
export function formatDayLabel(dayKey: string): string {
  const { year, month, day } = parseDayKeyParts(dayKey)
  return `${WEEKDAY_LABELS[weekdayIndex(dayKey)]}, ${MONTH_SHORT_LABELS[month - 1]} ${day}, ${year}`
}

/** `Oct 16` */
export function formatDayShortLabel(dayKey: string): string {
  const { month, day } = parseDayKeyParts(dayKey)
  return `${MONTH_SHORT_LABELS[month - 1]} ${day}`
}

/**
 * The UTC calendar day of a stored instant.
 *
 * Date-only fields — an assessment date, an exam date, a target date — are stored
 * as the instant at UTC midnight of the day the learner picked, so reading the day
 * back from its UTC date returns exactly that day in every browser timezone. Using
 * `toLocaleDateString()` instead would show the day before for anyone west of UTC.
 */
export function dayKeyFromInstant(instant: string): string {
  return instant.slice(0, 10)
}

/**
 * `<input type="date">` value for a stored instant.
 *
 * Pairs with {@link todayInputValue}: date-only fields round trip through UTC
 * midnight, so the day the learner picked is the day the form shows back.
 */
export function dateInputValue(instant: string): string {
  return dayKeyFromInstant(instant)
}

/** Today as a `YYYY-MM-DD` value for a date input, from the browser's local date. */
export function todayInputValue(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`
}

export function formatMonthLabel(dayKey: string): string {
  const { month } = parseDayKeyParts(dayKey)
  return MONTH_LABELS[month - 1] ?? ''
}

export function formatRangeLabel(range: CalendarRange): string {
  if (range.kind === 'CURRENT_YEAR') return `${range.year}`
  if (range.kind === 'PREVIOUS_YEAR') return `${range.year}`
  return `${formatDayShortLabel(range.from)}, ${parseDayKeyParts(range.from).year} – ${formatDayShortLabel(range.to)}, ${parseDayKeyParts(range.to).year}`
}

/**
 * Lays the days of a range out as GitHub-style week columns, padded with empty
 * cells so the first column starts on `weekStartsOn` and the last column is full.
 */
export function buildHeatmapColumns(
  days: readonly CalendarDay[],
  weekStartsOn: WeekStartsOn = 0,
): HeatmapCell[][] {
  if (days.length === 0) return []

  const ordered = [...days].sort((a, b) => a.date.localeCompare(b.date))
  const first = ordered[0]!.date
  const last = ordered[ordered.length - 1]!.date

  const leadingPadding = (weekdayIndex(first) - weekStartsOn + 7) % 7
  const trailingPadding = 6 - ((weekdayIndex(last) - weekStartsOn + 7) % 7)

  const byDate = new Map(ordered.map((day) => [day.date, day]))
  const columns: HeatmapCell[][] = []

  let cursor = addDaysToKey(first, -leadingPadding)
  const end = addDaysToKey(last, trailingPadding)

  while (cursor <= end) {
    const column: HeatmapCell[] = []
    for (let row = 0; row < 7; row++) {
      column.push({ date: cursor, day: byDate.get(cursor) ?? null })
      cursor = addDaysToKey(cursor, 1)
    }
    columns.push(column)
  }

  return columns
}

/**
 * Month captions for the heatmap header.
 *
 * A column is labelled with the month that *begins* inside it, which keeps the
 * first caption honest even when the first column is a padded week that starts in
 * the previous month. The fallback (month of the column's first in-range day) only
 * applies when the grid starts mid-month.
 */
export function buildMonthLabels(columns: readonly HeatmapCell[][]): HeatmapColumnLabel[] {
  const labels: HeatmapColumnLabel[] = []
  let labelledMonth: number | null = null

  columns.forEach((column, columnIndex) => {
    const inRange = column.filter((cell) => cell.day !== null)
    if (inRange.length === 0) return

    const monthStart = inRange.find((cell) => parseDayKeyParts(cell.date).day === 1)
    const { month } = parseDayKeyParts((monthStart ?? inRange[0]!).date)

    if (month !== labelledMonth) {
      labels.push({ columnIndex, label: MONTH_SHORT_LABELS[month - 1] ?? '' })
      labelledMonth = month
    }
  })

  return labels
}

export function formatMinutes(minutes: number): string {
  if (minutes <= 0) return '0m'
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest}m`
  if (rest === 0) return `${hours}h`
  return `${hours}h ${rest}m`
}

/** e.g. `1–20 min` for the given level, straight from the server's definitions. */
export function intensityLabelFor(level: number, levels: CalendarIntensityLevel[]): string {
  return levels.find((entry) => entry.level === level)?.label ?? `${level}`
}

export function dayTooltip(day: CalendarDay, levels: CalendarIntensityLevel[]): string {
  const label = formatDayLabel(day.date)
  if (day.totalMinutes <= 0) return `${label} — no study`

  const sessions = `${day.sessionCount} ${day.sessionCount === 1 ? 'session' : 'sessions'}`
  return `${label} — ${formatMinutes(day.totalMinutes)}, ${sessions} (${intensityLabelFor(day.intensity, levels)})`
}

/** Accessible name for a heatmap cell button. */
export function dayAriaLabel(day: CalendarDay, levels: CalendarIntensityLevel[]): string {
  const label = formatDayLabel(day.date)
  const parts = [`${formatMinutes(day.totalMinutes)} of study`, `${day.sessionCount} sessions`]
  if (day.qualified) parts.push('counts toward streak')
  return `${label}: ${parts.join(', ')}, intensity ${intensityLabelFor(day.intensity, levels)}`
}

/**
 * Compares a requested custom range against what the API accepts, so the form
 * can explain the problem instead of firing a request that will 422.
 */
export function validateRangeInputs(from: string, to: string, today: string): string | null {
  if (!from || !to) return 'Pick both a start and an end date.'
  if (!isDayKeyLike(from) || !isDayKeyLike(to)) return 'Dates must look like YYYY-MM-DD.'
  if (from > to) return 'The start date must not be after the end date.'
  if (diffDayKeys(from, to) + 1 > 731) return 'Custom ranges are limited to two years.'
  if (from > today) return 'The start date is in the future — there is nothing to show yet.'
  return null
}

/** Default custom range: the start of the current month through today. */
export function defaultCustomRange(today: string): { from: string; to: string } {
  const { year, month } = parseDayKeyParts(today)
  return { from: formatDayKey(year, month, 1), to: today }
}
