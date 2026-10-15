import { describe, it, expect } from 'vitest'
import {
  DEFAULT_INTENSITY_THRESHOLDS,
  DEFAULT_STREAK_QUALIFYING_MINUTES,
  MAX_INTENSITY_THRESHOLDS,
  aggregateSessionsByDay,
  buildCalendarDays,
  buildDayBreakdowns,
  describeIntensityLevels,
  isQualifyingDay,
  normalizeIntensityThresholds,
  normalizeQualifyingMinutes,
  resolveIntensityLevel,
  summarizeCalendarRange,
} from '../src/modules/calendar/calendar.domain.js'

describe('intensity thresholds', () => {
  it('falls back to the product defaults when nothing is configured', () => {
    expect(normalizeIntensityThresholds(undefined)).toEqual([20, 40, 60, 90])
    expect(normalizeIntensityThresholds(null)).toEqual([20, 40, 60, 90])
    expect(normalizeIntensityThresholds([])).toEqual([20, 40, 60, 90])
    expect(DEFAULT_INTENSITY_THRESHOLDS).toEqual([20, 40, 60, 90])
    expect(DEFAULT_STREAK_QUALIFYING_MINUTES).toBe(20)
  })

  it('sorts, deduplicates and rounds user-supplied thresholds', () => {
    expect(normalizeIntensityThresholds([60, 20, 40])).toEqual([20, 40, 60])
    expect(normalizeIntensityThresholds([20, 20, 40])).toEqual([20, 40])
    expect(normalizeIntensityThresholds([20.4, 40.6])).toEqual([20, 41])
  })

  it('drops unusable values instead of producing a broken scale', () => {
    expect(normalizeIntensityThresholds([0, -5, Number.NaN, 30])).toEqual([30])
    expect(normalizeIntensityThresholds([0, -5])).toEqual([20, 40, 60, 90])
    expect(normalizeIntensityThresholds(Array.from({ length: 20 }, (_, i) => i + 1))).toHaveLength(
      MAX_INTENSITY_THRESHOLDS,
    )
  })
})

describe('resolveIntensityLevel', () => {
  it('matches the documented default scale exactly', () => {
    const cases: Array<[number, number]> = [
      [0, 0],
      [1, 1],
      [20, 1],
      [21, 2],
      [40, 2],
      [41, 3],
      [60, 3],
      [61, 4],
      [90, 4],
      [91, 5],
      [240, 5],
    ]

    for (const [minutes, level] of cases) {
      expect(resolveIntensityLevel(minutes, [20, 40, 60, 90]), `${minutes}m`).toBe(level)
    }
  })

  it('respects custom thresholds', () => {
    const thresholds = [15, 30]
    expect(resolveIntensityLevel(0, thresholds)).toBe(0)
    expect(resolveIntensityLevel(15, thresholds)).toBe(1)
    expect(resolveIntensityLevel(16, thresholds)).toBe(2)
    expect(resolveIntensityLevel(30, thresholds)).toBe(2)
    expect(resolveIntensityLevel(31, thresholds)).toBe(3)
  })

  it('treats negative totals as no study', () => {
    expect(resolveIntensityLevel(-10, [20, 40])).toBe(0)
  })

  it('defaults to the built-in scale when thresholds are omitted', () => {
    expect(resolveIntensityLevel(25)).toBe(2)
  })
})

describe('describeIntensityLevels', () => {
  it('labels the default buckets the way the spec describes them', () => {
    expect(describeIntensityLevels().map((level) => level.label)).toEqual([
      'No study',
      '1–20 min',
      '21–40 min',
      '41–60 min',
      '61–90 min',
      '91+ min',
    ])
  })

  it('reports inclusive bounds that line up with resolveIntensityLevel', () => {
    const levels = describeIntensityLevels([20, 40, 60, 90])
    expect(levels[0]).toMatchObject({ level: 0, minMinutes: 0, maxMinutes: 0 })
    expect(levels[1]).toMatchObject({ level: 1, minMinutes: 1, maxMinutes: 20 })
    expect(levels[4]).toMatchObject({ level: 4, minMinutes: 61, maxMinutes: 90 })
    expect(levels[5]).toMatchObject({ level: 5, minMinutes: 91, maxMinutes: null })

    // Every level's midpoint must bucket back to that same level.
    for (const level of levels.slice(1)) {
      const midpoint = level.maxMinutes ?? level.minMinutes + 30
      expect(resolveIntensityLevel(midpoint, [20, 40, 60, 90])).toBe(level.level)
    }
  })

  it('follows custom thresholds', () => {
    expect(describeIntensityLevels([10, 25]).map((level) => level.label)).toEqual([
      'No study',
      '1–10 min',
      '11–25 min',
      '26+ min',
    ])
  })
})

describe('streak qualifying rule', () => {
  it('normalises the qualifying threshold', () => {
    expect(normalizeQualifyingMinutes(undefined)).toBe(20)
    expect(normalizeQualifyingMinutes(null)).toBe(20)
    expect(normalizeQualifyingMinutes(-5)).toBe(20)
    expect(normalizeQualifyingMinutes(Number.NaN)).toBe(20)
    expect(normalizeQualifyingMinutes(0)).toBe(0)
    expect(normalizeQualifyingMinutes(30)).toBe(30)
    expect(normalizeQualifyingMinutes(5000)).toBe(1440)
  })

  it('needs the full threshold, and never counts an empty day', () => {
    expect(isQualifyingDay(20, 20)).toBe(true)
    expect(isQualifyingDay(19, 20)).toBe(false)
    expect(isQualifyingDay(0, 0)).toBe(false)
    expect(isQualifyingDay(1, 0)).toBe(true)
    expect(isQualifyingDay(29, 30)).toBe(false)
    expect(isQualifyingDay(30, 30)).toBe(true)
  })
})

describe('aggregateSessionsByDay', () => {
  it('sums several sessions on the same local day', () => {
    const activity = aggregateSessionsByDay(
      [
        { startedAt: new Date('2026-10-16T08:00:00Z'), durationMinutes: 5 },
        { startedAt: new Date('2026-10-16T18:00:00Z'), durationMinutes: 8 },
        { startedAt: new Date('2026-10-16T21:30:00Z'), durationMinutes: 7 },
      ],
      'UTC',
    )

    expect(activity.get('2026-10-16')).toEqual({ totalMinutes: 20, sessionCount: 3 })
  })

  it('splits sessions into the user’s local days, not UTC days', () => {
    const activity = aggregateSessionsByDay(
      [
        // 23:59 on 2026-06-09 in New York
        { startedAt: new Date('2026-06-10T03:59:00Z'), durationMinutes: 30 },
        // 00:01 on 2026-06-10 in New York
        { startedAt: new Date('2026-06-10T04:01:00Z'), durationMinutes: 30 },
      ],
      'America/New_York',
    )

    expect([...activity.keys()].sort()).toEqual(['2026-06-09', '2026-06-10'])
    expect(activity.get('2026-06-09')).toEqual({ totalMinutes: 30, sessionCount: 1 })
    expect(activity.get('2026-06-10')).toEqual({ totalMinutes: 30, sessionCount: 1 })

    // The same rows under UTC land on one single day.
    const utcActivity = aggregateSessionsByDay(
      [
        { startedAt: new Date('2026-06-10T03:59:00Z'), durationMinutes: 30 },
        { startedAt: new Date('2026-06-10T04:01:00Z'), durationMinutes: 30 },
      ],
      'UTC',
    )
    expect([...utcActivity.keys()]).toEqual(['2026-06-10'])
  })

  it('assigns a session that crosses midnight to the day it started', () => {
    const activity = aggregateSessionsByDay(
      [{ startedAt: new Date('2026-10-16T23:50:00Z'), durationMinutes: 20 }],
      'UTC',
    )

    expect([...activity.keys()]).toEqual(['2026-10-16'])
    expect(activity.has('2026-10-17')).toBe(false)
  })

  it('returns an empty map for no sessions', () => {
    expect(aggregateSessionsByDay([], 'UTC').size).toBe(0)
  })
})

describe('buildCalendarDays', () => {
  it('zero-fills days with no activity and flags qualifying days', () => {
    const activity = new Map([
      ['2026-10-15', { totalMinutes: 45, sessionCount: 2 }],
      ['2026-10-17', { totalMinutes: 5, sessionCount: 1 }],
    ])

    const days = buildCalendarDays(
      ['2026-10-15', '2026-10-16', '2026-10-17'],
      activity,
      [20, 40, 60, 90],
      20,
    )

    expect(days).toEqual([
      { date: '2026-10-15', totalMinutes: 45, sessionCount: 2, intensity: 3, qualified: true },
      { date: '2026-10-16', totalMinutes: 0, sessionCount: 0, intensity: 0, qualified: false },
      { date: '2026-10-17', totalMinutes: 5, sessionCount: 1, intensity: 1, qualified: false },
    ])
  })
})

describe('summarizeCalendarRange', () => {
  it('totals the range and picks the best day', () => {
    const summary = summarizeCalendarRange([
      { date: '2026-10-14', totalMinutes: 0, sessionCount: 0, intensity: 0, qualified: false },
      { date: '2026-10-15', totalMinutes: 45, sessionCount: 2, intensity: 3, qualified: true },
      { date: '2026-10-16', totalMinutes: 90, sessionCount: 1, intensity: 4, qualified: true },
      { date: '2026-10-17', totalMinutes: 15, sessionCount: 1, intensity: 1, qualified: false },
    ])

    expect(summary).toEqual({
      totalMinutes: 150,
      sessionCount: 4,
      activeDays: 3,
      qualifyingDays: 2,
      averageMinutesPerActiveDay: 50,
      bestDay: { date: '2026-10-16', totalMinutes: 90 },
    })
  })

  it('reports an empty range without dividing by zero', () => {
    expect(
      summarizeCalendarRange([
        { date: '2026-10-15', totalMinutes: 0, sessionCount: 0, intensity: 0, qualified: false },
      ]),
    ).toEqual({
      totalMinutes: 0,
      sessionCount: 0,
      activeDays: 0,
      qualifyingDays: 0,
      averageMinutesPerActiveDay: 0,
      bestDay: null,
    })
  })

  it('keeps the earliest day when two days tie for best', () => {
    const summary = summarizeCalendarRange([
      { date: '2026-10-14', totalMinutes: 60, sessionCount: 1, intensity: 3, qualified: true },
      { date: '2026-10-15', totalMinutes: 60, sessionCount: 1, intensity: 3, qualified: true },
    ])

    expect(summary.bestDay).toEqual({ date: '2026-10-14', totalMinutes: 60 })
  })
})

describe('buildDayBreakdowns', () => {
  const grammar = { id: 'skill-grammar', name: 'Grammar' }
  const listening = { id: 'skill-listening', name: 'Listening' }
  const ielts = { id: 'cat-ielts', name: 'IELTS' }

  it('groups minutes by skill, category and topic', () => {
    const breakdowns = buildDayBreakdowns([
      {
        durationMinutes: 30,
        topic: '  Articles  ',
        skill: grammar,
        category: ielts,
      },
      { durationMinutes: 10, topic: 'Articles', skill: grammar, category: null },
      { durationMinutes: 20, topic: null, skill: listening, category: ielts },
    ])

    expect(breakdowns.skills).toEqual([
      { skillId: 'skill-grammar', name: 'Grammar', minutes: 40, sessionCount: 2, percentage: 67 },
      {
        skillId: 'skill-listening',
        name: 'Listening',
        minutes: 20,
        sessionCount: 1,
        percentage: 33,
      },
    ])
    expect(breakdowns.categories).toEqual([
      { categoryId: 'cat-ielts', name: 'IELTS', minutes: 50, sessionCount: 2, percentage: 83 },
      {
        categoryId: null,
        name: 'Uncategorised',
        minutes: 10,
        sessionCount: 1,
        percentage: 17,
      },
    ])
    expect(breakdowns.topics).toEqual([
      { topic: 'Articles', minutes: 40, sessionCount: 2, percentage: 67 },
    ])
  })

  it('omits blank topics but still counts their minutes in the percentages', () => {
    const breakdowns = buildDayBreakdowns([
      { durationMinutes: 30, topic: '   ', skill: grammar, category: null },
      { durationMinutes: 30, topic: 'Reading drills', skill: listening, category: null },
    ])

    expect(breakdowns.topics).toEqual([
      { topic: 'Reading drills', minutes: 30, sessionCount: 1, percentage: 50 },
    ])
  })

  it('returns empty breakdowns for a day without sessions', () => {
    expect(buildDayBreakdowns([])).toEqual({ skills: [], categories: [], topics: [] })
  })
})
