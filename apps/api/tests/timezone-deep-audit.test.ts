import { describe, it, expect } from 'vitest'
import {
  addDaysToDayKey,
  dayBoundsUtc,
  daysInMonth,
  diffDayKeys,
  endOfDayUtcExclusive,
  getDayKey,
  getLocalTimeLabel,
  isLeapYear,
  startOfDayUtc,
} from '../src/shared/timezone.js'
import { resolveGoalProgressWindow } from '../src/modules/goals/goal-periods.js'
import { computeStreakSummary } from '../src/modules/calendar/calendar.domain.js'
import {
  computeRemainingDays,
  computeElapsedDays,
  computeTotalDays,
  computeTimeProgressPercent,
  computeStudyProgressPercent,
  formatMinutes,
} from '../src/modules/plans/plan.service.js'
import {
  resolvePaceStatus,
  requiredDailyMinutes,
} from '../src/modules/analytics/analytics.domain.js'

describe('Timezone & Boundary Deep Audit', () => {
  const TOKYO = 'Asia/Tokyo' // UTC+9
  const NY = 'America/New_York' // UTC-5 / UTC-4 (DST)
  const KATHMANDU = 'Asia/Kathmandu' // UTC+5:45
  const LONDON = 'Europe/London' // UTC+0 / UTC+1 (BST)

  describe('Midnight Transitions & User Timezones', () => {
    it('correctly maps 1 second before and after midnight across timezones', () => {
      // In Tokyo (UTC+9), 2026-10-22 00:00 is 2026-10-21 15:00:00 UTC
      const beforeTokyoMidnight = new Date('2026-10-21T14:59:59.999Z')
      const atTokyoMidnight = new Date('2026-10-21T15:00:00.000Z')
      const afterTokyoMidnight = new Date('2026-10-21T15:00:01.000Z')

      expect(getDayKey(beforeTokyoMidnight, TOKYO)).toBe('2026-10-21')
      expect(getDayKey(atTokyoMidnight, TOKYO)).toBe('2026-10-22')
      expect(getDayKey(afterTokyoMidnight, TOKYO)).toBe('2026-10-22')

      expect(getLocalTimeLabel(beforeTokyoMidnight, TOKYO)).toBe('23:59')
      expect(getLocalTimeLabel(atTokyoMidnight, TOKYO)).toBe('00:00')
      expect(getLocalTimeLabel(afterTokyoMidnight, TOKYO)).toBe('00:00')

      // In New York (EDT, UTC-4), 2026-10-22 00:00 is 2026-10-22 04:00:00 UTC
      const beforeNyMidnight = new Date('2026-10-22T03:59:59.999Z')
      const atNyMidnight = new Date('2026-10-22T04:00:00.000Z')

      expect(getDayKey(beforeNyMidnight, NY)).toBe('2026-10-21')
      expect(getDayKey(atNyMidnight, NY)).toBe('2026-10-22')

      // In Kathmandu (UTC+5:45), 2026-10-22 00:00 is 2026-10-21 18:15:00 UTC
      const beforeKathmandu = new Date('2026-10-21T18:14:59.999Z')
      const atKathmandu = new Date('2026-10-21T18:15:00.000Z')

      expect(getDayKey(beforeKathmandu, KATHMANDU)).toBe('2026-10-21')
      expect(getDayKey(atKathmandu, KATHMANDU)).toBe('2026-10-22')
    })
  })

  describe('DST Shifts (Spring Forward 23h & Fall Back 25h)', () => {
    it('accurately defines day bounds during spring forward and fall back', () => {
      // US 2026 Spring Forward: 2026-03-08
      const nySpring = dayBoundsUtc('2026-03-08', NY)
      const nySpringHours = (nySpring.end.getTime() - nySpring.start.getTime()) / 3_600_000
      expect(nySpringHours).toBe(23)
      expect(startOfDayUtc('2026-03-08', NY).toISOString()).toBe('2026-03-08T05:00:00.000Z')
      expect(endOfDayUtcExclusive('2026-03-08', NY).toISOString()).toBe('2026-03-09T04:00:00.000Z')

      // US 2026 Fall Back: 2026-11-01
      const nyFall = dayBoundsUtc('2026-11-01', NY)
      const nyFallHours = (nyFall.end.getTime() - nyFall.start.getTime()) / 3_600_000
      expect(nyFallHours).toBe(25)
      expect(startOfDayUtc('2026-11-01', NY).toISOString()).toBe('2026-11-01T04:00:00.000Z')
      expect(endOfDayUtcExclusive('2026-11-01', NY).toISOString()).toBe('2026-11-02T05:00:00.000Z')

      // London 2026 Spring Forward: 2026-03-29
      const londonSpring = dayBoundsUtc('2026-03-29', LONDON)
      expect((londonSpring.end.getTime() - londonSpring.start.getTime()) / 3_600_000).toBe(23)

      // London 2026 Fall Back: 2026-10-25
      const londonFall = dayBoundsUtc('2026-10-25', LONDON)
      expect((londonFall.end.getTime() - londonFall.start.getTime()) / 3_600_000).toBe(25)
    })
  })

  describe('Month and Year Boundaries & Leap Years', () => {
    it('handles leap year 2024 and 2028 February 29 correctly', () => {
      expect(isLeapYear(2024)).toBe(true)
      expect(isLeapYear(2026)).toBe(false)
      expect(isLeapYear(2028)).toBe(true)
      expect(isLeapYear(2100)).toBe(false) // Century non-leap
      expect(isLeapYear(2000)).toBe(true) // 400-year leap

      expect(daysInMonth(2024, 2)).toBe(29)
      expect(daysInMonth(2026, 2)).toBe(28)
      expect(daysInMonth(2028, 2)).toBe(29)

      expect(addDaysToDayKey('2024-02-28', 1)).toBe('2024-02-29')
      expect(addDaysToDayKey('2024-02-29', 1)).toBe('2024-03-01')

      expect(addDaysToDayKey('2026-02-28', 1)).toBe('2026-03-01')

      // Crossing year boundary
      expect(addDaysToDayKey('2026-12-31', 1)).toBe('2027-01-01')
      expect(addDaysToDayKey('2027-01-01', -1)).toBe('2026-12-31')
      expect(diffDayKeys('2026-12-31', '2027-01-01')).toBe(1)
    })
  })

  describe('Remaining Days & Long-Term Plan Math Across Boundaries', () => {
    it('computes remaining days correctly across month, year, leap year and DST boundaries', () => {
      // Same day before end date instant
      const current = new Date('2026-10-22T10:00:00Z')
      const sameDayEnd = new Date('2026-10-22T23:59:59Z')
      expect(computeRemainingDays(sameDayEnd, current, 'UTC')).toBe(1)

      // Past end date
      const pastEnd = new Date('2026-10-22T09:00:00Z')
      expect(computeRemainingDays(pastEnd, current, 'UTC')).toBe(0)

      // Across month boundary: Oct 30 to Nov 2 (3 days)
      const oct30 = new Date('2026-10-30T12:00:00Z')
      const nov2 = new Date('2026-11-02T12:00:00Z')
      expect(computeRemainingDays(nov2, oct30, 'UTC')).toBe(3)

      // Across leap year: Feb 28 2024 to Mar 1 2024 (2 days: 29th and 1st)
      const feb28_2024 = new Date('2024-02-28T12:00:00Z')
      const mar1_2024 = new Date('2024-03-01T12:00:00Z')
      expect(computeRemainingDays(mar1_2024, feb28_2024, 'UTC')).toBe(2)

      // Across non-leap year: Feb 28 2026 to Mar 1 2026 (1 day)
      const feb28_2026 = new Date('2026-02-28T12:00:00Z')
      const mar1_2026 = new Date('2026-03-01T12:00:00Z')
      expect(computeRemainingDays(mar1_2026, feb28_2026, 'UTC')).toBe(1)

      // Across year boundary: Dec 30 2026 to Jan 2 2027 (3 days)
      const dec30 = new Date('2026-12-30T12:00:00Z')
      const jan2 = new Date('2027-01-02T12:00:00Z')
      expect(computeRemainingDays(jan2, dec30, 'UTC')).toBe(3)
    })

    it('computes total days, elapsed days, and time progress accurately', () => {
      const start = new Date('2026-01-01T00:00:00Z')
      const end = new Date('2026-01-11T00:00:00Z') // 10 days
      const halfway = new Date('2026-01-06T00:00:00Z') // 5 days

      expect(computeTotalDays(start, end, 'UTC')).toBe(10)
      expect(computeElapsedDays(start, halfway, 'UTC')).toBe(5)
      expect(computeTimeProgressPercent(start, end, halfway, 'UTC')).toBe(50)

      // Past plan end
      const afterEnd = new Date('2026-01-15T00:00:00Z')
      expect(computeTimeProgressPercent(start, end, afterEnd, 'UTC')).toBe(100)
      expect(computeRemainingDays(end, afterEnd, 'UTC')).toBe(0)

      // Before plan start
      const beforeStart = new Date('2025-12-25T00:00:00Z')
      expect(computeElapsedDays(start, beforeStart, 'UTC')).toBe(0)
      expect(computeTimeProgressPercent(start, end, beforeStart, 'UTC')).toBe(0)
    })

    it('computes study progress and formatting without precision artifacts', () => {
      expect(computeStudyProgressPercent(60, 120)).toBe(50)
      expect(computeStudyProgressPercent(150, 120)).toBe(100) // capped at 100
      expect(computeStudyProgressPercent(0, 120)).toBe(0)
      expect(computeStudyProgressPercent(50, 0)).toBe(0) // 0 target safe

      expect(formatMinutes(0)).toBe('0m')
      expect(formatMinutes(45)).toBe('45m')
      expect(formatMinutes(60)).toBe('1h')
      expect(formatMinutes(125)).toBe('2h 5m')
    })
  })

  describe('Daily, Weekly, Monthly Goals Across Timezones & DST', () => {
    it('creates accurate goal progress windows across Monday-Sunday and months', () => {
      // Friday Oct 16 in NY
      const friday = new Date('2026-10-16T15:00:00Z')
      const weeklyWindow = resolveGoalProgressWindow({
        period: 'WEEKLY',
        startDate: new Date('2026-01-01T00:00:00Z'),
        endDate: null,
        timeZone: NY,
        now: friday,
      })

      expect(weeklyWindow).not.toBeNull()
      // Monday of that week: 2026-10-12 local -> 2026-10-12T04:00:00Z
      expect(weeklyWindow!.start.toISOString()).toBe('2026-10-12T04:00:00.000Z')
      // Next Monday: 2026-10-19 local -> 2026-10-19T04:00:00Z
      expect(weeklyWindow!.end.toISOString()).toBe('2026-10-19T04:00:00.000Z')

      // Monthly window over February in leap year 2024
      const feb2024 = new Date('2024-02-15T12:00:00Z')
      const monthlyWindow = resolveGoalProgressWindow({
        period: 'MONTHLY',
        startDate: new Date('2024-01-01T00:00:00Z'),
        endDate: null,
        timeZone: 'UTC',
        now: feb2024,
      })
      expect(monthlyWindow!.start.toISOString()).toBe('2024-02-01T00:00:00.000Z')
      expect(monthlyWindow!.end.toISOString()).toBe('2024-03-01T00:00:00.000Z')
      expect((monthlyWindow!.end.getTime() - monthlyWindow!.start.getTime()) / 86_400_000).toBe(29)
    })
  })

  describe('Streak Calculation Across Boundaries', () => {
    it('maintains streaks across month boundaries, leap years, and DST days', () => {
      // Consecutive qualifying days across leap year Feb 28 -> Feb 29 -> Mar 1 2024
      const leapDays = new Map<string, number>([
        ['2024-02-27', 30],
        ['2024-02-28', 25],
        ['2024-02-29', 40],
        ['2024-03-01', 50],
      ])

      const summary = computeStreakSummary({
        dayMinutes: leapDays,
        todayKey: '2024-03-01',
        qualifyingMinutes: 20,
      })

      expect(summary.currentStreak).toBe(4)
      expect(summary.currentStreakStart).toBe('2024-02-27')
      expect(summary.currentStreakEnd).toBe('2024-03-01')
      expect(summary.todayQualified).toBe(true)

      // Across year boundary Dec 30 2025 -> Jan 2 2026
      const yearTurnDays = new Map<string, number>([
        ['2025-12-30', 30],
        ['2025-12-31', 30],
        ['2026-01-01', 30],
        ['2026-01-02', 30],
      ])
      const yearSummary = computeStreakSummary({
        dayMinutes: yearTurnDays,
        todayKey: '2026-01-02',
        qualifyingMinutes: 20,
      })
      expect(yearSummary.currentStreak).toBe(4)
      expect(yearSummary.currentStreakStart).toBe('2025-12-30')
      expect(yearSummary.currentStreakEnd).toBe('2026-01-02')

      // Pending streak when today has 0 minutes but yesterday qualified
      const pendingSummary = computeStreakSummary({
        dayMinutes: yearTurnDays,
        todayKey: '2026-01-03', // no sessions yet today
        qualifyingMinutes: 20,
      })
      expect(pendingSummary.currentStreak).toBe(4)
      expect(pendingSummary.todayQualified).toBe(false)
      expect(pendingSummary.todayPending).toBe(true)
      expect(pendingSummary.minutesToQualifyToday).toBe(20)
    })
  })

  describe('Pace Status and Analytics Calculations', () => {
    it('accurately resolves pace status (on-track, ahead, behind, not-started, completed)', () => {
      // 50% time elapsed, 50% studied -> on-track
      expect(
        resolvePaceStatus({
          targetMinutes: 1000,
          actualMinutes: 500,
          timeProgressPercent: 50,
        }),
      ).toBe('on-track')

      // 50% time elapsed, 70% studied -> ahead (behindBy = -20 < -10)
      expect(
        resolvePaceStatus({
          targetMinutes: 1000,
          actualMinutes: 700,
          timeProgressPercent: 50,
        }),
      ).toBe('ahead')

      // 50% time elapsed, 35% studied -> behind (behindBy = 15 > 10)
      expect(
        resolvePaceStatus({
          targetMinutes: 1000,
          actualMinutes: 350,
          timeProgressPercent: 50,
        }),
      ).toBe('behind')

      // 0 actual minutes -> not-started
      expect(
        resolvePaceStatus({
          targetMinutes: 1000,
          actualMinutes: 0,
          timeProgressPercent: 50,
        }),
      ).toBe('not-started')

      // Target already met -> completed
      expect(
        resolvePaceStatus({
          targetMinutes: 1000,
          actualMinutes: 1000,
          timeProgressPercent: 50,
        }),
      ).toBe('completed')
    })

    it('calculates required daily minutes without division by zero', () => {
      // 500 minutes remaining across 10 days = 50 min/day
      expect(requiredDailyMinutes(1000, 500, 10)).toBe(50)

      // Remaining days is 0 -> returns remaining minutes directly
      expect(requiredDailyMinutes(1000, 500, 0)).toBe(500)

      // Already completed -> 0 min/day
      expect(requiredDailyMinutes(1000, 1100, 5)).toBe(0)
    })
  })
})
