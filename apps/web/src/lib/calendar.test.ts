import { describe, it, expect } from 'vitest'
import type { CalendarDay } from '@lingopath/types'
import {
  addDaysToKey,
  buildHeatmapColumns,
  buildMonthLabels,
  dayAriaLabel,
  dayTooltip,
  defaultCustomRange,
  diffDayKeys,
  formatDayLabel,
  formatDayShortLabel,
  formatMinutes,
  formatMonthLabel,
  formatRangeLabel,
  intensityClass,
  isDayKeyLike,
  parseDayKeyParts,
  validateRangeInputs,
  weekdayIndex,
} from './calendar'

function day(date: string, totalMinutes = 0, sessionCount = 0): CalendarDay {
  const intensity = totalMinutes === 0 ? 0 : totalMinutes <= 20 ? 1 : totalMinutes <= 40 ? 2 : 3
  return { date, totalMinutes, sessionCount, intensity, qualified: totalMinutes >= 20 }
}

describe('day key helpers', () => {
  it('parses and re-formats without timezone drift', () => {
    expect(parseDayKeyParts('2026-10-16')).toEqual({ year: 2026, month: 10, day: 16 })
    expect(formatDayShortLabel('2026-10-16')).toBe('Oct 16')
    expect(formatDayLabel('2026-10-16')).toBe('Fri, Oct 16, 2026')
    expect(formatMonthLabel('2026-10-16')).toBe('October')
  })

  it('adds days across month, year and leap boundaries', () => {
    expect(addDaysToKey('2026-10-16', 1)).toBe('2026-10-17')
    expect(addDaysToKey('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDaysToKey('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDaysToKey('2026-01-01', -1)).toBe('2025-12-31')
    expect(addDaysToKey('2024-02-28', 1)).toBe('2024-02-29')
    expect(addDaysToKey('2026-02-28', 1)).toBe('2026-03-01')
    expect(addDaysToKey('2026-03-08', -7)).toBe('2026-03-01')
  })

  it('counts whole days between keys', () => {
    expect(diffDayKeys('2026-10-01', '2026-10-16')).toBe(15)
    expect(diffDayKeys('2026-10-16', '2026-10-01')).toBe(-15)
    expect(diffDayKeys('2026-01-01', '2027-01-01')).toBe(365)
  })

  it('maps weekdays', () => {
    expect(weekdayIndex('2026-10-16')).toBe(5)
    expect(weekdayIndex('2026-10-18')).toBe(0)
  })

  it('validates day-like input for the custom range form', () => {
    expect(isDayKeyLike('2026-10-16')).toBe(true)
    expect(isDayKeyLike('2024-02-29')).toBe(true)
    expect(isDayKeyLike('2026-02-30')).toBe(false)
    expect(isDayKeyLike('2026-10-16T00:00:00Z')).toBe(false)
    expect(isDayKeyLike('')).toBe(false)
  })
})

describe('buildHeatmapColumns', () => {
  it('pads the first and last week so every column has seven days', () => {
    const days = ['2026-10-05', '2026-10-06', '2026-10-07'].map((date) => day(date))
    const columns = buildHeatmapColumns(days, 0)

    expect(columns).toHaveLength(1)
    expect(columns[0]).toHaveLength(7)
    // Monday 2026-10-05 sits on row 1 of a Sunday-first week.
    expect(columns[0]![0]).toMatchObject({ date: '2026-10-04', day: null })
    expect(columns[0]![1]).toMatchObject({ date: '2026-10-05' })
    expect(columns[0]![6]).toMatchObject({ date: '2026-10-10', day: null })
  })

  it('honours a Monday week start', () => {
    const columns = buildHeatmapColumns([day('2026-10-05')], 1)

    expect(columns).toHaveLength(1)
    expect(columns[0]![0]).toMatchObject({ date: '2026-10-05' })
    expect(columns[0]![6]).toMatchObject({ date: '2026-10-11', day: null })
  })

  it('lays a full year out as full week columns', () => {
    const year: CalendarDay[] = []
    let cursor = '2026-01-01'
    for (let index = 0; index < 365; index++) {
      year.push(day(cursor))
      cursor = addDaysToKey(cursor, 1)
    }

    const columns = buildHeatmapColumns(year, 0)

    expect(columns).toHaveLength(53)
    for (const column of columns) expect(column).toHaveLength(7)

    // Every real day of the range appears exactly once.
    const realDays = columns.flat().filter((cell) => cell.day !== null)
    expect(realDays).toHaveLength(365)
    expect(realDays[0]!.date).toBe('2026-01-01')
    expect(realDays[364]!.date).toBe('2026-12-31')
  })

  it('handles a leap year and a range that starts mid-week', () => {
    const days: CalendarDay[] = []
    let cursor = '2024-02-26' // a Monday
    for (let index = 0; index < 7; index++) {
      days.push(day(cursor))
      cursor = addDaysToKey(cursor, 1)
    }

    const columns = buildHeatmapColumns(days, 1)

    expect(columns).toHaveLength(1)
    expect(columns[0]!.map((cell) => cell.date)).toEqual([
      '2024-02-26',
      '2024-02-27',
      '2024-02-28',
      '2024-02-29',
      '2024-03-01',
      '2024-03-02',
      '2024-03-03',
    ])
  })

  it('returns nothing for an empty range', () => {
    expect(buildHeatmapColumns([], 0)).toEqual([])
  })
})

describe('buildMonthLabels', () => {
  it('labels each month once, at the column where it starts', () => {
    const days: CalendarDay[] = []
    let cursor = '2026-01-01'
    while (cursor <= '2026-03-31') {
      days.push(day(cursor))
      cursor = addDaysToKey(cursor, 1)
    }

    const labels = buildMonthLabels(buildHeatmapColumns(days, 0))

    expect(labels.map((entry) => entry.label)).toEqual(['Jan', 'Feb', 'Mar'])
    expect(labels[0]!.columnIndex).toBe(0)
    for (let index = 1; index < labels.length; index++) {
      expect(labels[index]!.columnIndex).toBeGreaterThan(labels[index - 1]!.columnIndex)
    }
  })

  it('captions a mid-month range with the month it starts in', () => {
    const days: CalendarDay[] = []
    let cursor = '2026-10-05'
    while (cursor <= '2026-11-08') {
      days.push(day(cursor))
      cursor = addDaysToKey(cursor, 1)
    }

    expect(buildMonthLabels(buildHeatmapColumns(days, 0)).map((entry) => entry.label)).toEqual([
      'Oct',
      'Nov',
    ])
  })
})

describe('intensity presentation', () => {
  it('maps levels to distinct classes and clamps the top of the scale', () => {
    expect(intensityClass(0)).toContain('bg-muted')
    expect(intensityClass(1)).toContain('bg-primary/20')
    expect(intensityClass(5)).toContain('bg-primary')
    expect(intensityClass(9)).toBe(intensityClass(5))
    expect(intensityClass(-1)).toBe(intensityClass(0))
  })

  it('builds a tooltip and an accessible label from the server level definitions', () => {
    const levels = [
      { level: 0, minMinutes: 0, maxMinutes: 0, label: 'No study' },
      { level: 1, minMinutes: 1, maxMinutes: 20, label: '1–20 min' },
      { level: 2, minMinutes: 21, maxMinutes: 40, label: '21–40 min' },
    ]

    expect(dayTooltip(day('2026-10-16', 0, 0), levels)).toBe('Fri, Oct 16, 2026 — no study')
    expect(dayTooltip(day('2026-10-16', 30, 2), levels)).toBe(
      'Fri, Oct 16, 2026 — 30m, 2 sessions (21–40 min)',
    )
    expect(dayAriaLabel(day('2026-10-16', 30, 2), levels)).toBe(
      'Fri, Oct 16, 2026: 30m of study, 2 sessions, counts toward streak, intensity 21–40 min',
    )
    expect(dayAriaLabel(day('2026-10-16', 10, 1), levels)).not.toContain('counts toward streak')
  })
})

describe('formatting', () => {
  it('formats minutes the way the rest of the app does', () => {
    expect(formatMinutes(0)).toBe('0m')
    expect(formatMinutes(45)).toBe('45m')
    expect(formatMinutes(60)).toBe('1h')
    expect(formatMinutes(95)).toBe('1h 35m')
  })

  it('labels year ranges and custom ranges', () => {
    expect(
      formatRangeLabel({ kind: 'CURRENT_YEAR', from: '2026-01-01', to: '2026-12-31', year: 2026 }),
    ).toBe('2026')
    expect(
      formatRangeLabel({ kind: 'CUSTOM', from: '2026-10-01', to: '2026-10-16', year: null }),
    ).toBe('Oct 1, 2026 – Oct 16, 2026')
  })
})

describe('custom range validation', () => {
  const today = '2026-10-16'

  it('accepts a sane range', () => {
    expect(validateRangeInputs('2026-10-01', '2026-10-16', today)).toBeNull()
    expect(validateRangeInputs('2025-01-01', '2026-10-16', today)).toBeNull()
  })

  it('explains what is wrong', () => {
    expect(validateRangeInputs('', '2026-10-16', today)).toMatch(/both/i)
    expect(validateRangeInputs('2026-13-01', '2026-10-16', today)).toMatch(/YYYY-MM-DD/)
    expect(validateRangeInputs('2026-10-16', '2026-10-01', today)).toMatch(/must not be after/i)
    expect(validateRangeInputs('2000-01-01', '2026-10-16', today)).toMatch(/two years/i)
    expect(validateRangeInputs('2027-01-01', '2027-02-01', today)).toMatch(/future/i)
  })

  it('defaults the custom range to the current month', () => {
    expect(defaultCustomRange('2026-10-16')).toEqual({ from: '2026-10-01', to: '2026-10-16' })
    expect(defaultCustomRange('2026-02-28')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
  })
})
