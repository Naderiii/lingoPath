/**
 * Timezone helpers for translating between UTC instants — how `StudySession`
 * rows are stored — and the user's local calendar days (Phase 7).
 *
 * Everything here is built on `Intl.DateTimeFormat` with an IANA timezone name,
 * so DST transitions, half-hour offsets (`Asia/Kathmandu` +05:45), 45-minute DST
 * shifts (`Australia/Lord_Howe`) and date-line anomalies are handled by the
 * platform instead of hand-rolled offset arithmetic. The previous ad-hoc
 * implementations (`new Date('YYYY-MM-DDTHH:mm:ss')`) silently used the
 * *server's* local timezone, which made every day boundary wrong for any user
 * whose timezone differed from the server's.
 *
 * Day keys are plain `YYYY-MM-DD` strings in the user's timezone. They are the
 * currency of the calendar/streak domain: all day arithmetic happens on keys,
 * never on instants, which is what keeps month boundaries, year boundaries, leap
 * days and DST-safe iterations correct.
 */

export const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

const MS_PER_DAY = 86_400_000
const MAX_ENUMERATED_DAYS = 3_660 // 10 years — guards against unbounded loops

const formatterCache = new Map<string, Intl.DateTimeFormat>()

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone)
  if (cached) return cached

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    // `h23` keeps midnight at 00 instead of the `24` some engines emit.
    hourCycle: 'h23',
    numberingSystem: 'latn',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  formatterCache.set(timeZone, formatter)
  return formatter
}

/** True when `timeZone` is an IANA name this runtime understands. */
export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone) return false
  try {
    getFormatter(timeZone)
    return true
  } catch {
    return false
  }
}

export interface ZonedDateTimeParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

/** Wall-clock time of `instant` in `timeZone`. */
export function getZonedParts(instant: Date, timeZone: string): ZonedDateTimeParts {
  const values: Partial<Record<string, number>> = {}
  for (const part of getFormatter(timeZone).formatToParts(instant)) {
    if (part.type !== 'literal') values[part.type] = Number(part.value)
  }

  return {
    year: values['year'] ?? 0,
    month: values['month'] ?? 1,
    day: values['day'] ?? 1,
    hour: (values['hour'] ?? 0) % 24,
    minute: values['minute'] ?? 0,
    second: values['second'] ?? 0,
  }
}

/** Formats numeric parts as a `YYYY-MM-DD` day key. */
export function formatDayKey(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Local calendar day of `instant` in `timeZone`, as `YYYY-MM-DD`. */
export function getDayKey(instant: Date, timeZone: string): string {
  const parts = getZonedParts(instant, timeZone)
  return formatDayKey(parts.year, parts.month, parts.day)
}

/** Local wall clock of `instant` as `HH:mm` in `timeZone`. */
export function getLocalTimeLabel(instant: Date, timeZone: string): string {
  const parts = getZonedParts(instant, timeZone)
  return `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`
}

/** Parses a day key into its numeric parts. Throws for malformed or impossible dates. */
export function parseDayKey(dayKey: string): { year: number; month: number; day: number } {
  if (!DAY_KEY_PATTERN.test(dayKey)) {
    throw new RangeError(`Invalid day key '${dayKey}' — expected YYYY-MM-DD`)
  }

  const [yearText, monthText, dayText] = dayKey.split('-') as [string, string, string]
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)

  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new RangeError(`Invalid day key '${dayKey}' — not a real calendar date`)
  }

  return { year, month, day }
}

/** True when `value` is a real calendar date written as `YYYY-MM-DD`. */
export function isDayKey(value: string): boolean {
  try {
    parseDayKey(value)
    return true
  } catch {
    return false
  }
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

export function daysInMonth(year: number, month: number): number {
  if (month < 1 || month > 12) return 0
  if (month === 2) return isLeapYear(year) ? 29 : 28
  return [4, 6, 9, 11].includes(month) ? 30 : 31
}

/**
 * Offset of `timeZone` at `instant`, in milliseconds — positive east of UTC.
 * Resolved from the formatted wall clock, so DST is accounted for exactly at the
 * instant being asked about.
 */
export function getTimeZoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = getZonedParts(instant, timeZone)
  const asIfUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  )
  const instantMs = instant.getTime()
  return asIfUtc - instantMs + (instantMs % 1000)
}

/**
 * UTC instant at which the local day `dayKey` starts in `timeZone`.
 *
 * Two offset guesses are derived (one from the naive UTC instant, one from the
 * instant that guess implies) and each candidate is verified by formatting it
 * back to a local date. The earliest candidate that really lands on `dayKey` wins:
 *
 *  - On a day whose local midnight exists, both candidates agree and DST is
 *    already baked in — a 23-hour or 25-hour day comes out exactly right.
 *  - On a day whose local midnight is skipped (Chile springs forward at 00:00),
 *    the unverified second guess would land on the *previous* local day and make
 *    day ranges overlap. Verification rejects it, and the day correctly starts
 *    at 01:00 local.
 *  - If no candidate lands on `dayKey`, that local date does not exist in this
 *    zone at all (e.g. Pacific/Apia skipped 2011-12-30 when it crossed the date
 *    line). The latest candidate is returned, which makes the day an empty range
 *    without disturbing its neighbours.
 */
export function startOfDayUtc(dayKey: string, timeZone: string): Date {
  const { year, month, day } = parseDayKey(dayKey)
  const naive = Date.UTC(year, month - 1, day, 0, 0, 0, 0)

  const firstOffset = getTimeZoneOffsetMs(new Date(naive), timeZone)
  const firstGuess = naive - firstOffset
  const secondOffset = getTimeZoneOffsetMs(new Date(firstGuess), timeZone)

  const candidates =
    firstOffset === secondOffset ? [firstGuess] : [firstGuess, naive - secondOffset]

  const matching = candidates.filter(
    (candidate) => getDayKey(new Date(candidate), timeZone) === dayKey,
  )

  return new Date(matching.length > 0 ? Math.min(...matching) : Math.max(...candidates))
}

/**
 * Exclusive end of the local day `dayKey`. Defined as the start of the following
 * day, which makes day ranges contiguous by construction — no gaps or overlaps
 * on 23-hour and 25-hour DST days.
 */
export function endOfDayUtcExclusive(dayKey: string, timeZone: string): Date {
  return startOfDayUtc(addDaysToDayKey(dayKey, 1), timeZone)
}

/** Half-open UTC window `[start, end)` covering the whole local day. */
export function dayBoundsUtc(dayKey: string, timeZone: string): { start: Date; end: Date } {
  return { start: startOfDayUtc(dayKey, timeZone), end: endOfDayUtcExclusive(dayKey, timeZone) }
}

/**
 * Pure calendar arithmetic on day keys. Month lengths, leap years and year
 * boundaries are handled by the UTC calendar, so this never drifts by an hour
 * the way `instant + 86_400_000` does across a DST transition.
 */
export function addDaysToDayKey(dayKey: string, days: number): string {
  const { year, month, day } = parseDayKey(dayKey)
  const shifted = new Date(Date.UTC(year, month - 1, day) + days * MS_PER_DAY)
  return formatDayKey(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate())
}

/** Whole days from `from` to `to` (negative when `to` precedes `from`). */
export function diffDayKeys(from: string, to: string): number {
  const a = parseDayKey(from)
  const b = parseDayKey(to)
  return Math.round(
    (Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / MS_PER_DAY,
  )
}

/** Inclusive list of day keys from `from` to `to`. */
export function enumerateDayKeys(from: string, to: string): string[] {
  parseDayKey(from)
  parseDayKey(to)

  const total = diffDayKeys(from, to)
  if (total < 0) return []
  if (total + 1 > MAX_ENUMERATED_DAYS) {
    throw new RangeError(`Refusing to enumerate ${total + 1} days (max ${MAX_ENUMERATED_DAYS})`)
  }

  const keys: string[] = []
  for (let offset = 0; offset <= total; offset++) {
    keys.push(addDaysToDayKey(from, offset))
  }
  return keys
}

/** `0` = Sunday … `6` = Saturday. Calendar-only; independent of timezone. */
export function getWeekdayIndex(dayKey: string): number {
  const { year, month, day } = parseDayKey(dayKey)
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

export function startOfYearDayKey(year: number): string {
  return formatDayKey(year, 1, 1)
}

export function endOfYearDayKey(year: number): string {
  return formatDayKey(year, 12, 31)
}

/** Calendar year the day key belongs to. */
export function getDayKeyYear(dayKey: string): number {
  return parseDayKey(dayKey).year
}
