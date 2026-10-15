import { describe, it, expect } from 'vitest'
import {
  addDaysToDayKey,
  dayBoundsUtc,
  daysInMonth,
  diffDayKeys,
  endOfDayUtcExclusive,
  enumerateDayKeys,
  formatDayKey,
  getDayKey,
  getDayKeyYear,
  getLocalTimeLabel,
  getTimeZoneOffsetMs,
  getWeekdayIndex,
  isDayKey,
  isLeapYear,
  isValidTimeZone,
  parseDayKey,
  startOfDayUtc,
} from '../src/shared/timezone.js'

const HOUR = 3_600_000

describe('isValidTimeZone', () => {
  it('accepts IANA zone names', () => {
    expect(isValidTimeZone('UTC')).toBe(true)
    expect(isValidTimeZone('America/New_York')).toBe(true)
    expect(isValidTimeZone('Asia/Kathmandu')).toBe(true)
    expect(isValidTimeZone('Australia/Lord_Howe')).toBe(true)
  })

  it('rejects unknown or empty zone names', () => {
    expect(isValidTimeZone('Mars/Olympus')).toBe(false)
    expect(isValidTimeZone('')).toBe(false)
    expect(isValidTimeZone('GMT+25')).toBe(false)
  })
})

describe('getDayKey', () => {
  it('resolves the local day in UTC', () => {
    expect(getDayKey(new Date('2026-10-16T00:00:00.000Z'), 'UTC')).toBe('2026-10-16')
    expect(getDayKey(new Date('2026-10-16T23:59:59.999Z'), 'UTC')).toBe('2026-10-16')
  })

  it('resolves the local day east of UTC (Tokyo rolls over at 15:00Z)', () => {
    expect(getDayKey(new Date('2026-10-16T14:59:00.000Z'), 'Asia/Tokyo')).toBe('2026-10-16')
    expect(getDayKey(new Date('2026-10-16T15:00:00.000Z'), 'Asia/Tokyo')).toBe('2026-10-17')
  })

  it('resolves the local day west of UTC (New York is still yesterday at 03:30Z)', () => {
    expect(getDayKey(new Date('2026-10-16T03:30:00.000Z'), 'America/New_York')).toBe('2026-10-15')
    expect(getDayKey(new Date('2026-10-16T04:30:00.000Z'), 'America/New_York')).toBe('2026-10-16')
  })

  it('handles a 45-minute offset (Kathmandu rolls over at 18:15Z)', () => {
    expect(getDayKey(new Date('2026-10-16T18:14:00.000Z'), 'Asia/Kathmandu')).toBe('2026-10-16')
    expect(getDayKey(new Date('2026-10-16T18:15:00.000Z'), 'Asia/Kathmandu')).toBe('2026-10-17')
  })

  it('reports midnight as 00:00 rather than 24:00', () => {
    expect(getLocalTimeLabel(new Date('2026-10-16T00:00:00.000Z'), 'UTC')).toBe('00:00')
    expect(getLocalTimeLabel(new Date('2026-10-16T15:00:00.000Z'), 'Asia/Tokyo')).toBe('00:00')
  })
})

describe('startOfDayUtc / endOfDayUtcExclusive', () => {
  it('round-trips a plain UTC day', () => {
    expect(startOfDayUtc('2026-10-16', 'UTC').toISOString()).toBe('2026-10-16T00:00:00.000Z')
    expect(endOfDayUtcExclusive('2026-10-16', 'UTC').toISOString()).toBe('2026-10-17T00:00:00.000Z')
  })

  it('is exact for a 45-minute offset zone', () => {
    expect(startOfDayUtc('2026-06-15', 'Asia/Kathmandu').toISOString()).toBe(
      '2026-06-14T18:15:00.000Z',
    )
  })

  it('produces a 23-hour day when DST starts (New York, 2026-03-08)', () => {
    const length =
      endOfDayUtcExclusive('2026-03-08', 'America/New_York').getTime() -
      startOfDayUtc('2026-03-08', 'America/New_York').getTime()
    expect(length).toBe(23 * HOUR)
    expect(startOfDayUtc('2026-03-09', 'America/New_York').toISOString()).toBe(
      '2026-03-09T04:00:00.000Z',
    )
  })

  it('produces a 25-hour day when DST ends (New York, 2026-11-01)', () => {
    const length =
      endOfDayUtcExclusive('2026-11-01', 'America/New_York').getTime() -
      startOfDayUtc('2026-11-01', 'America/New_York').getTime()
    expect(length).toBe(25 * HOUR)
    expect(startOfDayUtc('2026-11-01', 'America/New_York').toISOString()).toBe(
      '2026-11-01T04:00:00.000Z',
    )
  })

  it('produces a 23.5-hour day for a 30-minute DST shift (Lord Howe, 2026-10-05)', () => {
    const length =
      endOfDayUtcExclusive('2026-10-04', 'Australia/Lord_Howe').getTime() -
      startOfDayUtc('2026-10-04', 'Australia/Lord_Howe').getTime()
    expect(length).toBe(23.5 * HOUR)
  })

  it('falls back to the first instant of a day whose local midnight does not exist', () => {
    // Chile springs forward at 00:00 on 2026-09-06: local midnight is skipped.
    const start = startOfDayUtc('2026-09-06', 'America/Santiago')
    expect(start.toISOString()).toBe('2026-09-06T04:00:00.000Z')
    expect(getLocalTimeLabel(start, 'America/Santiago')).toBe('01:00')
    // …and the previous day still ends exactly where this one starts.
    expect(endOfDayUtcExclusive('2026-09-05', 'America/Santiago').toISOString()).toBe(
      start.toISOString(),
    )
  })

  it('keeps day ranges contiguous across a zone that skipped a whole calendar date', () => {
    // Samoa jumped from 2011-12-29 straight to 2011-12-31: 2011-12-30 never existed.
    const missing = dayBoundsUtc('2011-12-30', 'Pacific/Apia')
    const before = dayBoundsUtc('2011-12-29', 'Pacific/Apia')
    const after = dayBoundsUtc('2011-12-31', 'Pacific/Apia')

    expect(missing.end.getTime()).toBe(missing.start.getTime())
    expect(missing.end.getTime()).toBe(after.start.getTime())
    expect(before.end.getTime()).toBe(missing.start.getTime())
    expect(before.end.getTime() - before.start.getTime()).toBe(24 * HOUR)
    expect(after.end.getTime() - after.start.getTime()).toBe(24 * HOUR)
  })

  it('keeps consecutive day ranges contiguous and non-overlapping for a whole year', () => {
    const zones = [
      'UTC',
      'Asia/Tokyo',
      'Asia/Kathmandu',
      'America/New_York',
      'Europe/London',
      'America/Santiago',
      'Australia/Lord_Howe',
      'Pacific/Auckland',
    ]
    const allowedLengths = [23, 23.5, 24, 24.5, 25].map((hours) => hours * HOUR)

    for (const zone of zones) {
      const days = enumerateDayKeys('2026-01-01', '2026-12-31')
      let previousEnd: number | null = null
      let total = 0

      for (const day of days) {
        const { start, end } = dayBoundsUtc(day, zone)
        expect(end.getTime()).toBeGreaterThan(start.getTime())
        expect(allowedLengths).toContain(end.getTime() - start.getTime())
        if (previousEnd !== null) expect(start.getTime()).toBe(previousEnd)
        previousEnd = end.getTime()
        total += end.getTime() - start.getTime()
      }

      // A year of local days always adds up to exactly 365 × 24h: the hour lost
      // in spring is returned in autumn, with no gaps and no double counting.
      expect(total).toBe(365 * 24 * HOUR)
    }
  })
})

describe('getTimeZoneOffsetMs', () => {
  it('reports signed offsets east and west of UTC', () => {
    expect(getTimeZoneOffsetMs(new Date('2026-06-15T12:00:00Z'), 'UTC')).toBe(0)
    expect(getTimeZoneOffsetMs(new Date('2026-06-15T12:00:00Z'), 'Asia/Tokyo')).toBe(9 * HOUR)
    expect(getTimeZoneOffsetMs(new Date('2026-06-15T12:00:00Z'), 'Asia/Kathmandu')).toBe(
      5.75 * HOUR,
    )
    expect(getTimeZoneOffsetMs(new Date('2026-06-15T12:00:00Z'), 'America/New_York')).toBe(
      -4 * HOUR,
    )
  })

  it('follows DST transitions', () => {
    expect(getTimeZoneOffsetMs(new Date('2026-03-08T06:00:00Z'), 'America/New_York')).toBe(
      -5 * HOUR,
    )
    expect(getTimeZoneOffsetMs(new Date('2026-03-08T08:00:00Z'), 'America/New_York')).toBe(
      -4 * HOUR,
    )
  })

  it('keeps millisecond precision out of the seconds-based comparison', () => {
    expect(getTimeZoneOffsetMs(new Date('2026-06-15T12:00:00.750Z'), 'Asia/Tokyo')).toBe(9 * HOUR)
  })
})

describe('day key arithmetic', () => {
  it('crosses month boundaries', () => {
    expect(addDaysToDayKey('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDaysToDayKey('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDaysToDayKey('2026-04-30', 1)).toBe('2026-05-01')
  })

  it('crosses year boundaries in both directions', () => {
    expect(addDaysToDayKey('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDaysToDayKey('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('handles leap days', () => {
    expect(addDaysToDayKey('2024-02-28', 1)).toBe('2024-02-29')
    expect(addDaysToDayKey('2024-02-29', 1)).toBe('2024-03-01')
    expect(addDaysToDayKey('2026-02-28', 1)).toBe('2026-03-01')
    expect(isLeapYear(2024)).toBe(true)
    expect(isLeapYear(2100)).toBe(false)
    expect(isLeapYear(2000)).toBe(true)
    expect(daysInMonth(2024, 2)).toBe(29)
    expect(daysInMonth(2026, 2)).toBe(28)
  })

  it('is unaffected by DST transitions', () => {
    // 86_400_000 ms after the local start of 2026-03-07 in New York is not
    // 2026-03-08; key arithmetic must not drift like instant arithmetic does.
    expect(addDaysToDayKey('2026-03-07', 1)).toBe('2026-03-08')
    expect(addDaysToDayKey('2026-11-01', 1)).toBe('2026-11-02')
  })

  it('counts whole days between keys', () => {
    expect(diffDayKeys('2026-01-01', '2026-01-01')).toBe(0)
    expect(diffDayKeys('2026-01-01', '2026-01-02')).toBe(1)
    expect(diffDayKeys('2026-01-02', '2026-01-01')).toBe(-1)
    expect(diffDayKeys('2026-02-28', '2026-03-01')).toBe(1)
    expect(diffDayKeys('2024-02-28', '2024-03-01')).toBe(2)
    expect(diffDayKeys('2025-12-31', '2026-01-01')).toBe(1)
    expect(diffDayKeys('2026-01-01', '2027-01-01')).toBe(365)
    expect(diffDayKeys('2026-01-01', '2027-03-28')).toBe(365 + 31 + 28 + 27)
  })

  it('enumerates inclusive ranges', () => {
    expect(enumerateDayKeys('2026-01-01', '2026-01-03')).toEqual([
      '2026-01-01',
      '2026-01-02',
      '2026-01-03',
    ])
    expect(enumerateDayKeys('2026-01-01', '2026-01-01')).toEqual(['2026-01-01'])
    expect(enumerateDayKeys('2026-01-02', '2026-01-01')).toEqual([])
    expect(enumerateDayKeys('2026-12-31', '2027-01-01')).toEqual(['2026-12-31', '2027-01-01'])
  })

  it('refuses to enumerate absurd ranges', () => {
    expect(() => enumerateDayKeys('1900-01-01', '2100-01-01')).toThrow(RangeError)
  })
})

describe('day key validation and helpers', () => {
  it('accepts real dates and rejects impossible ones', () => {
    expect(isDayKey('2026-10-16')).toBe(true)
    expect(isDayKey('2024-02-29')).toBe(true)
    expect(isDayKey('2026-02-29')).toBe(false)
    expect(isDayKey('2026-02-30')).toBe(false)
    expect(isDayKey('2026-13-01')).toBe(false)
    expect(isDayKey('2026-00-10')).toBe(false)
    expect(isDayKey('2026-1-01')).toBe(false)
    expect(isDayKey('16-10-2026')).toBe(false)
    expect(isDayKey('')).toBe(false)
    expect(isDayKey('2026-10-16T00:00:00Z')).toBe(false)
  })

  it('throws a RangeError from parseDayKey for malformed input', () => {
    expect(() => parseDayKey('2026-02-30')).toThrow(RangeError)
    expect(() => parseDayKey('nope')).toThrow(RangeError)
    expect(parseDayKey('2026-10-16')).toEqual({ year: 2026, month: 10, day: 16 })
  })

  it('formats and reads back parts', () => {
    expect(formatDayKey(2026, 1, 5)).toBe('2026-01-05')
    expect(getDayKeyYear('2026-10-16')).toBe(2026)
  })

  it('maps day keys to weekdays without timezone drift', () => {
    expect(getWeekdayIndex('2026-10-16')).toBe(5) // Friday
    expect(getWeekdayIndex('2026-01-01')).toBe(4) // Thursday
    expect(getWeekdayIndex('2024-02-29')).toBe(4) // Thursday
    expect(getWeekdayIndex('2026-10-18')).toBe(0) // Sunday
  })
})
