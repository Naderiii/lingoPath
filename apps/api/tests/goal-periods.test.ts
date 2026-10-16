import { describe, it, expect } from 'vitest'
import { periodDayRange, resolveGoalProgressWindow } from '../src/modules/goals/goal-periods.js'

/**
 * Regression tests for the Phase 5 defect where a goal's `period` was inert:
 * progress summed everything since `startDate`, so a DAILY goal accumulated
 * forever and disagreed with the dashboard's window.
 */

const NY = 'America/New_York'

describe('periodDayRange', () => {
  it('returns the anchor day for DAILY', () => {
    expect(periodDayRange('DAILY', '2026-10-16')).toEqual({ from: '2026-10-16', to: '2026-10-16' })
  })

  it('returns the Monday–Sunday week for WEEKLY', () => {
    // 2026-10-16 is a Friday.
    expect(periodDayRange('WEEKLY', '2026-10-16')).toEqual({
      from: '2026-10-12',
      to: '2026-10-18',
    })
    // Sunday belongs to the week that started on the previous Monday.
    expect(periodDayRange('WEEKLY', '2026-10-18')).toEqual({
      from: '2026-10-12',
      to: '2026-10-18',
    })
    // …and Monday starts a new one.
    expect(periodDayRange('WEEKLY', '2026-10-19')).toEqual({
      from: '2026-10-19',
      to: '2026-10-25',
    })
  })

  it('handles weeks that span a year boundary', () => {
    expect(periodDayRange('WEEKLY', '2026-01-01')).toEqual({
      from: '2025-12-29',
      to: '2026-01-04',
    })
  })

  it('returns the calendar month for MONTHLY, including leap February', () => {
    expect(periodDayRange('MONTHLY', '2026-10-16')).toEqual({
      from: '2026-10-01',
      to: '2026-10-31',
    })
    expect(periodDayRange('MONTHLY', '2026-02-10')).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    })
    expect(periodDayRange('MONTHLY', '2024-02-10')).toEqual({
      from: '2024-02-01',
      to: '2024-02-29',
    })
  })

  it('returns the calendar year for YEARLY', () => {
    expect(periodDayRange('YEARLY', '2026-10-16')).toEqual({ from: '2026-01-01', to: '2026-12-31' })
  })
})

describe('resolveGoalProgressWindow', () => {
  const openGoal = {
    period: 'DAILY' as const,
    startDate: new Date('2026-01-01T00:00:00Z'),
    endDate: null,
  }

  const windowHours = (window: { start: Date; end: Date } | null): number =>
    window === null ? 0 : (window.end.getTime() - window.start.getTime()) / 3_600_000

  it('measures the current local day, not the UTC day', () => {
    // 01:00 UTC on 2026-10-17 is still 2026-10-16 in New York.
    const window = resolveGoalProgressWindow({
      ...openGoal,
      timeZone: NY,
      now: new Date('2026-10-17T01:00:00Z'),
    })

    expect(window?.anchorDayKey).toBe('2026-10-16')
    expect(window?.start.toISOString()).toBe('2026-10-16T04:00:00.000Z')
    expect(window?.end.toISOString()).toBe('2026-10-17T04:00:00.000Z')
  })

  it('produces a 25-hour window on a DST fall-back day', () => {
    const window = resolveGoalProgressWindow({
      ...openGoal,
      timeZone: NY,
      now: new Date('2026-11-01T18:00:00Z'),
    })

    expect(windowHours(window)).toBe(25)
  })

  it('produces a 23-hour window on a DST spring-forward day', () => {
    const window = resolveGoalProgressWindow({
      ...openGoal,
      timeZone: NY,
      now: new Date('2026-03-08T18:00:00Z'),
    })

    expect(windowHours(window)).toBe(23)
  })

  it('measures the week containing now for WEEKLY goals', () => {
    const window = resolveGoalProgressWindow({
      period: 'WEEKLY',
      startDate: new Date('2026-01-01T00:00:00Z'),
      endDate: null,
      timeZone: 'UTC',
      now: new Date('2026-10-16T12:00:00Z'),
    })

    expect(window?.start.toISOString()).toBe('2026-10-12T00:00:00.000Z')
    expect(window?.end.toISOString()).toBe('2026-10-19T00:00:00.000Z')
  })

  it('measures the month containing now for MONTHLY goals', () => {
    const window = resolveGoalProgressWindow({
      period: 'MONTHLY',
      startDate: new Date('2026-01-01T00:00:00Z'),
      endDate: null,
      timeZone: 'UTC',
      now: new Date('2026-10-31T23:30:00Z'),
    })

    expect(window?.start.toISOString()).toBe('2026-10-01T00:00:00.000Z')
    expect(window?.end.toISOString()).toBe('2026-11-01T00:00:00.000Z')
  })

  it('measures the year containing now for YEARLY goals', () => {
    const yearWindow = resolveGoalProgressWindow({
      period: 'YEARLY',
      startDate: new Date('2026-01-01T00:00:00Z'),
      endDate: null,
      timeZone: 'UTC',
      now: new Date('2026-12-31T23:59:00Z'),
    })

    expect(yearWindow?.start.toISOString()).toBe('2026-01-01T00:00:00.000Z')
    expect(yearWindow?.end.toISOString()).toBe('2027-01-01T00:00:00.000Z')
  })

  it('measures the final period once a goal has ended', () => {
    const window = resolveGoalProgressWindow({
      period: 'DAILY',
      startDate: new Date('2026-10-01T00:00:00Z'),
      endDate: new Date('2026-10-10T00:00:00Z'),
      timeZone: 'UTC',
      now: new Date('2026-11-20T12:00:00Z'),
    })

    // The goal's last day, not "today" and not "everything since October 1".
    expect(window?.anchorDayKey).toBe('2026-10-10')
    expect(window?.start.toISOString()).toBe('2026-10-10T00:00:00.000Z')
    expect(window?.end.toISOString()).toBe('2026-10-11T00:00:00.000Z')
  })

  it('clips the window to the goal validity range', () => {
    const window = resolveGoalProgressWindow({
      period: 'MONTHLY',
      startDate: new Date('2026-10-20T09:00:00Z'),
      endDate: new Date('2026-10-25T15:00:00Z'),
      timeZone: 'UTC',
      now: new Date('2026-10-22T12:00:00Z'),
    })

    expect(window?.start.toISOString()).toBe('2026-10-20T09:00:00.000Z')
    // Through the end of the end date's local day.
    expect(window?.end.toISOString()).toBe('2026-10-26T00:00:00.000Z')
  })

  it('treats end-of-day and midnight end dates the same way', () => {
    const common = {
      period: 'DAILY' as const,
      startDate: new Date('2026-10-01T00:00:00Z'),
      timeZone: 'UTC',
      now: new Date('2026-11-20T12:00:00Z'),
    }

    const midnight = resolveGoalProgressWindow({
      ...common,
      endDate: new Date('2026-10-10T00:00:00Z'),
    })
    const endOfDay = resolveGoalProgressWindow({
      ...common,
      endDate: new Date('2026-10-10T23:59:59.999Z'),
    })

    expect(midnight?.start.toISOString()).toBe('2026-10-10T00:00:00.000Z')
    expect(midnight?.end.toISOString()).toBe('2026-10-11T00:00:00.000Z')
    expect(endOfDay?.start.toISOString()).toBe(midnight?.start.toISOString())
    expect(endOfDay?.end.toISOString()).toBe(midnight?.end.toISOString())
  })

  it('returns no window for a goal that has not started yet', () => {
    const window = resolveGoalProgressWindow({
      period: 'DAILY',
      startDate: new Date('2026-12-01T00:00:00Z'),
      endDate: null,
      timeZone: 'UTC',
      now: new Date('2026-10-16T12:00:00Z'),
    })

    expect(window).toBeNull()
  })
})
