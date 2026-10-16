import { describe, it, expect } from 'vitest'
import type { AnalyticsMetricDelta, AnalyticsPlan } from '@lingopath/types'
import {
  chartDomainMax,
  deltaTone,
  describeDelta,
  describePace,
  diffDayKeys,
  formatBucketLabel,
  formatMinutes,
  formatRangeLabel,
  paceTone,
  toChartPoints,
  toPlanMonthPoints,
  toPlanWeekPoints,
  validateRangeInputs,
} from './analytics'

function delta(partial: Partial<AnalyticsMetricDelta>): AnalyticsMetricDelta {
  return {
    current: 0,
    previous: 0,
    absolute: 0,
    changePercent: null,
    zeroBaseline: true,
    direction: 'flat',
    ...partial,
  }
}

describe('formatting', () => {
  it('formats minutes like the rest of the app', () => {
    expect(formatMinutes(0)).toBe('0m')
    expect(formatMinutes(45)).toBe('45m')
    expect(formatMinutes(60)).toBe('1h')
    expect(formatMinutes(95)).toBe('1h 35m')
  })

  it('labels ranges without a locale dependency', () => {
    expect(formatRangeLabel('2026-07-19', '2026-10-16')).toBe('Jul 19 – Oct 16, 2026')
    expect(formatRangeLabel('2025-12-01', '2026-01-15')).toBe('Dec 1, 2025 – Jan 15, 2026')
  })

  it('labels buckets by granularity', () => {
    expect(formatBucketLabel('2026-10-16', 'day')).toBe('Oct 16, 2026')
    expect(formatBucketLabel('2026-10-12', 'week')).toBe('Week of Oct 12')
    expect(formatBucketLabel('2026-10', 'month')).toBe('Oct 2026')
  })
})

describe('comparison labels', () => {
  it('shows a percentage when a baseline exists', () => {
    expect(
      describeDelta(
        delta({
          current: 150,
          previous: 100,
          absolute: 50,
          changePercent: 50,
          zeroBaseline: false,
          direction: 'up',
        }),
      ),
    ).toBe('+50%')
    expect(
      describeDelta(
        delta({
          current: 50,
          previous: 100,
          absolute: -50,
          changePercent: -50,
          zeroBaseline: false,
          direction: 'down',
        }),
      ),
    ).toBe('-50%')
  })

  it('never prints an infinity for a zero baseline', () => {
    expect(
      describeDelta(delta({ current: 600, previous: 0, absolute: 600, direction: 'up' })),
    ).toBe('New')
    expect(describeDelta(delta({ current: 0, previous: 0 }))).toBe('No change')
  })

  it('maps direction to a tone', () => {
    expect(deltaTone(delta({ direction: 'up' }))).toBe('positive')
    expect(deltaTone(delta({ direction: 'down' }))).toBe('negative')
    expect(deltaTone(delta({ direction: 'flat' }))).toBe('neutral')
  })
})

describe('chart preparation', () => {
  it('adds labels and rounded hours', () => {
    const points = toChartPoints(
      [
        { bucket: '2026-10-15', minutes: 90, sessions: 2 },
        { bucket: '2026-10-16', minutes: 0, sessions: 0 },
      ],
      'day',
    )

    expect(points[0]).toMatchObject({ label: 'Oct 15, 2026', minutes: 90, hours: 1.5, sessions: 2 })
    expect(points[1]).toMatchObject({ minutes: 0, hours: 0 })
  })

  it('keeps an empty series renderable and gives tall bars headroom', () => {
    expect(chartDomainMax([])).toBe(60)
    expect(chartDomainMax([{ bucket: 'x', label: 'x', minutes: 0, hours: 0, sessions: 0 }])).toBe(
      60,
    )
    expect(
      chartDomainMax([{ bucket: 'x', label: 'x', minutes: 200, hours: 3.3, sessions: 1 }]),
    ).toBe(240)
  })

  it('labels plan month and week series', () => {
    expect(toPlanMonthPoints([{ month: '2026-10', totalMinutes: 480 }])[0]).toMatchObject({
      label: 'Oct 2026',
      hours: 8,
    })
    expect(toPlanWeekPoints([{ weekStart: '2026-10-12', totalMinutes: 120 }])[0]).toMatchObject({
      label: 'Oct 12',
      hours: 2,
    })
  })
})

describe('plan pacing copy', () => {
  const basePlan: AnalyticsPlan = {
    planId: 'plan-1',
    title: 'Plan',
    objectiveTitle: null,
    startDate: '2026-01-01T00:00:00.000Z',
    endDate: '2026-07-01T00:00:00.000Z',
    targetMinutes: 18000,
    actualMinutes: 9000,
    remainingMinutes: 9000,
    unassignedMinutes: 0,
    studyProgressPercent: 50,
    timeProgressPercent: 50,
    elapsedDays: 90,
    totalDays: 180,
    remainingDays: 90,
    paceStatus: 'on-track',
    requiredDailyMinutes: 100,
    milestones: [],
    monthly: [],
    weekly: [],
  }

  it('explains an on-track plan', () => {
    expect(describePace(basePlan)).toContain('on track')
  })

  it('explains how far behind a plan is and what it needs per day', () => {
    const behind: AnalyticsPlan = {
      ...basePlan,
      paceStatus: 'behind',
      timeProgressPercent: 60,
      studyProgressPercent: 40,
      requiredDailyMinutes: 120,
    }

    expect(describePace(behind)).toContain('20 points behind')
    expect(describePace(behind)).toContain('2h/day')
  })

  it('explains a completed or untouched plan', () => {
    expect(describePace({ ...basePlan, paceStatus: 'completed', actualMinutes: 18000 })).toContain(
      'Target reached',
    )
    expect(describePace({ ...basePlan, paceStatus: 'not-started', actualMinutes: 0 })).toContain(
      '1h 40m/day needed',
    )
  })

  it('tones pace badges', () => {
    expect(paceTone('ahead')).toBe('positive')
    expect(paceTone('completed')).toBe('positive')
    expect(paceTone('behind')).toBe('negative')
    expect(paceTone('on-track')).toBe('neutral')
  })
})

describe('custom range validation', () => {
  it('accepts a sane window', () => {
    expect(validateRangeInputs('2026-01-01', '2026-03-31')).toBeNull()
    expect(validateRangeInputs('2025-10-16', '2026-10-16')).toBeNull()
  })

  it('explains what is wrong', () => {
    expect(validateRangeInputs('', '2026-01-01')).toMatch(/both/i)
    expect(validateRangeInputs('2026-02-30', '2026-03-01')).toMatch(/YYYY-MM-DD/)
    expect(validateRangeInputs('2026-03-31', '2026-01-01')).toMatch(/must not be after/i)
    expect(validateRangeInputs('2000-01-01', '2026-01-01')).toMatch(/two years/i)
  })

  it('counts days without timezone drift', () => {
    expect(diffDayKeys('2026-01-01', '2026-01-01')).toBe(0)
    expect(diffDayKeys('2026-01-01', '2026-01-31')).toBe(30)
    expect(diffDayKeys('2024-02-28', '2024-03-01')).toBe(2)
    expect(diffDayKeys('2025-12-31', '2026-01-01')).toBe(1)
  })
})
