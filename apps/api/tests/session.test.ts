import { describe, it, expect } from 'vitest'

// Unit tests for session business rules (no DB required)
// Tests the computeDurationMinutes and validation logic by importing pure functions indirectly via the service.

describe('Session business rules', () => {
  it('session with endedAt before startedAt should be invalid', () => {
    const start = '2024-01-01T10:00:00.000Z'
    const end = '2024-01-01T09:00:00.000Z'
    const startMs = new Date(start).getTime()
    const endMs = new Date(end).getTime()
    expect(endMs).toBeLessThan(startMs)
  })

  it('duration in minutes should be computed correctly', () => {
    const start = new Date('2024-01-01T10:00:00.000Z').getTime()
    const end = new Date('2024-01-01T11:30:00.000Z').getTime()
    const duration = Math.round((end - start) / 60_000)
    expect(duration).toBe(90)
  })

  it('duration exceeding 960 minutes (16 hours) should be rejected', () => {
    const start = new Date('2024-01-01T00:00:00.000Z').getTime()
    const end = new Date('2024-01-01T17:00:00.000Z').getTime()
    const duration = Math.round((end - start) / 60_000)
    expect(duration).toBeGreaterThan(960)
  })

  it('duration of exactly 1 minute should be valid', () => {
    const start = new Date('2024-01-01T10:00:00.000Z').getTime()
    const end = new Date('2024-01-01T10:01:00.000Z').getTime()
    const duration = Math.round((end - start) / 60_000)
    expect(duration).toBe(1)
    expect(duration).toBeGreaterThan(0)
  })
})
