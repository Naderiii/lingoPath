import type { GoalPeriod } from '@lingopath/types'
import {
  addDaysToDayKey,
  dayBoundsUtc,
  daysInMonth,
  formatDayKey,
  getDayKey,
  getWeekdayIndex,
  parseDayKey,
} from '../../shared/timezone.js'

/**
 * The one definition of "which slice of time does a goal's progress measure".
 *
 * Phase 5 modelled `period` (DAILY/WEEKLY/MONTHLY/YEARLY) but never derived a
 * window from it — progress silently accumulated everything since `startDate`,
 * and the dashboard computed its own (broken) windows, so the same goal reported
 * different numbers on different endpoints. Both call sites now use this module.
 *
 * Rules (recorded product decisions):
 * - A period is a *local* calendar slice in the user's timezone: a local day,
 *   a Monday–Sunday week, a calendar month, or a calendar year. DST days are
 *   handled by the shared day-key helpers, so a 23-hour day is still one day.
 * - An active goal measures the *current* period.
 * - A goal whose `endDate` has passed measures the period containing its end —
 *   historical goals keep showing their last real period instead of resetting
 *   to zero or accumulating forever.
 * - The window is clipped to the goal's validity range (`startDate`..`endDate`),
 *   so a goal created mid-week shows the partial period it actually existed for.
 * - If the window is empty (goal starts in the future, or validity does not
 *   intersect the period), progress is zero — not an error.
 */

export interface GoalProgressWindowInput {
  period: GoalPeriod
  /** Inclusive instant the goal becomes valid. */
  startDate: Date
  /** Inclusive instant the goal stops being valid, or `null` for open-ended. */
  endDate: Date | null
  timeZone: string
  now: Date
}

export interface GoalProgressWindow {
  /** Half-open UTC window `[start, end)` the progress is measured over. */
  start: Date
  end: Date
  /** Local day key of the anchor (the current or final period being measured). */
  anchorDayKey: string
}

/** Local day keys `[from, to]` (inclusive) of the period containing `anchorDayKey`. */
export function periodDayRange(
  period: GoalPeriod,
  anchorDayKey: string,
): { from: string; to: string } {
  const { year, month } = parseDayKey(anchorDayKey)

  switch (period) {
    case 'DAILY':
      return { from: anchorDayKey, to: anchorDayKey }
    case 'WEEKLY': {
      // Monday-start weeks, matching the dashboard and goal dialogs.
      const back = (getWeekdayIndex(anchorDayKey) + 6) % 7
      const from = addDaysToDayKey(anchorDayKey, -back)
      return { from, to: addDaysToDayKey(from, 6) }
    }
    case 'MONTHLY':
      return {
        from: formatDayKey(year, month, 1),
        to: formatDayKey(year, month, daysInMonth(year, month)),
      }
    case 'YEARLY':
      return { from: formatDayKey(year, 1, 1), to: formatDayKey(year, 12, 31) }
  }
}

export function resolveGoalProgressWindow(
  input: GoalProgressWindowInput,
): GoalProgressWindow | null {
  const { period, startDate, endDate, timeZone, now } = input

  // Finished goals measure the period they ended in; active goals measure now.
  const anchorInstant = endDate && endDate.getTime() < now.getTime() ? endDate : now
  const anchorDayKey = getDayKey(anchorInstant, timeZone)

  const { from, to } = periodDayRange(period, anchorDayKey)
  const { start: periodStart } = dayBoundsUtc(from, timeZone)
  const { start: nextDayAfterTo } = dayBoundsUtc(addDaysToDayKey(to, 1), timeZone)

  // `endDate` is treated as an inclusive *date* boundary: a goal that ends at
  // 2026-10-10T00:00Z is valid through 2026-10-10, not through a 1-millisecond
  // sliver of it. Goals created through the UI already store end-of-day, so this
  // only affects API-created rows. `startDate` keeps its instant, so a mid-day
  // start stays a partial first period.
  const endDayKey = endDate ? getDayKey(endDate, timeZone) : null
  const validityEnd = endDayKey
    ? dayBoundsUtc(addDaysToDayKey(endDayKey, 1), timeZone).start.getTime()
    : Number.POSITIVE_INFINITY

  const start = periodStart.getTime() > startDate.getTime() ? periodStart : startDate
  const end = nextDayAfterTo.getTime() < validityEnd ? nextDayAfterTo : new Date(validityEnd)

  if (start.getTime() >= end.getTime()) {
    return null
  }

  return { start, end, anchorDayKey }
}
