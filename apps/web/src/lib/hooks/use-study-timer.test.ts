import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useStudyTimer, type TimerSessionResult } from './use-study-timer'

describe('useStudyTimer', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('initializes in idle state', () => {
    const { result } = renderHook(() => useStudyTimer())
    expect(result.current.status).toBe('idle')
    expect(result.current.elapsedSeconds).toBe(0)
    expect(result.current.isActive).toBe(false)
  })

  it('starts running correctly', () => {
    const { result } = renderHook(() => useStudyTimer())

    act(() => {
      result.current.start('skill-123', 'cat-456')
    })

    expect(result.current.status).toBe('running')
    expect(result.current.skillId).toBe('skill-123')
    expect(result.current.categoryId).toBe('cat-456')
    expect(result.current.isActive).toBe(true)
  })

  it('pauses and resumes correctly', () => {
    const { result } = renderHook(() => useStudyTimer())

    act(() => {
      result.current.start('skill-123')
    })

    act(() => {
      vi.advanceTimersByTime(5000)
    })

    act(() => {
      result.current.pause()
    })

    expect(result.current.status).toBe('paused')

    act(() => {
      vi.advanceTimersByTime(5000)
    })

    // Elapsed should stay at ~5 seconds while paused
    expect(result.current.elapsedSeconds).toBe(5)

    act(() => {
      result.current.resume()
    })

    expect(result.current.status).toBe('running')

    act(() => {
      vi.advanceTimersByTime(3000)
    })

    expect(result.current.elapsedSeconds).toBe(8)
  })

  it('stops and returns session data with unique stop token', () => {
    const { result } = renderHook(() => useStudyTimer())

    act(() => {
      result.current.start('skill-123', 'cat-456')
    })

    act(() => {
      vi.advanceTimersByTime(60_000) // 1 minute
    })

    let sessionData: TimerSessionResult | null = null
    act(() => {
      sessionData = result.current.stop()
    })

    expect(sessionData).not.toBeNull()
    const data = sessionData as unknown as TimerSessionResult
    expect(data.skillId).toBe('skill-123')
    expect(data.categoryId).toBe('cat-456')
    expect(data.durationMinutes).toBe(1)
    expect(data.stopToken).toBeDefined()

    // Second stop should return null (prevent duplicate stop/session creation)
    let secondStop: TimerSessionResult | null = null
    act(() => {
      secondStop = result.current.stop()
    })
    expect(secondStop).toBeNull()
  })
})
