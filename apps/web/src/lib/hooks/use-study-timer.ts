'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

// ─── Types ───────────────────────────────────────────────────────────────────

export type TimerStatus = 'idle' | 'running' | 'paused'

export interface TimerSessionResult {
  startedAt: string
  endedAt: string
  durationMinutes: number
  skillId: string
  categoryId: string | null
  stopToken: string
}

export interface TimerState {
  status: TimerStatus
  startedAt: string | null
  accumulatedMs: number
  intervalStartedAt: string | null
  skillId: string | null
  categoryId: string | null
  stopToken: string | null
}

export interface UseStudyTimerReturn {
  status: TimerStatus
  elapsedSeconds: number
  skillId: string | null
  categoryId: string | null
  start: (skillId: string, categoryId?: string) => void
  pause: () => void
  resume: () => void
  stop: () => TimerSessionResult | null
  reset: () => void
  isActive: boolean
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STORAGE_KEY = 'lingopath-study-timer'
const TICK_INTERVAL_MS = 1000

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getInitialState(): TimerState {
  return {
    status: 'idle',
    startedAt: null,
    accumulatedMs: 0,
    intervalStartedAt: null,
    skillId: null,
    categoryId: null,
    stopToken: null,
  }
}

function loadState(): TimerState {
  if (typeof window === 'undefined') return getInitialState()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return getInitialState()
    const parsed = JSON.parse(raw) as TimerState
    if (!parsed.status || !['idle', 'running', 'paused'].includes(parsed.status)) {
      return getInitialState()
    }
    return parsed
  } catch {
    return getInitialState()
  }
}

function saveState(state: TimerState): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Ignore
  }
}

function clearState(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Ignore
  }
}

function generateStopToken(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function computeElapsedMs(state: TimerState): number {
  let total = state.accumulatedMs
  if (state.status === 'running' && state.intervalStartedAt) {
    total += Date.now() - new Date(state.intervalStartedAt).getTime()
  }
  return Math.max(0, total)
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useStudyTimer(): UseStudyTimerReturn {
  const [timerState, setTimerState] = useState<TimerState>(getInitialState)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const stoppedTokensRef = useRef<Set<string>>(new Set())
  const initializedRef = useRef(false)

  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true

    const loaded = loadState()
    setTimerState(loaded)
    setElapsedSeconds(Math.floor(computeElapsedMs(loaded) / 1000))
  }, [])

  useEffect(() => {
    if (!initializedRef.current) return
    saveState(timerState)
  }, [timerState])

  const { status, intervalStartedAt, accumulatedMs } = timerState

  useEffect(() => {
    if (status === 'running') {
      setElapsedSeconds(Math.floor(computeElapsedMs(timerState) / 1000))

      tickRef.current = setInterval(() => {
        setElapsedSeconds(Math.floor(computeElapsedMs(timerState) / 1000))
      }, TICK_INTERVAL_MS)
    } else {
      if (tickRef.current) {
        clearInterval(tickRef.current)
        tickRef.current = null
      }
      setElapsedSeconds(Math.floor(computeElapsedMs(timerState) / 1000))
    }

    return () => {
      if (tickRef.current) {
        clearInterval(tickRef.current)
        tickRef.current = null
      }
    }
  }, [status, intervalStartedAt, accumulatedMs, timerState])

  const start = useCallback((skillId: string, categoryId?: string) => {
    const now = new Date().toISOString()
    const newState: TimerState = {
      status: 'running',
      startedAt: now,
      accumulatedMs: 0,
      intervalStartedAt: now,
      skillId,
      categoryId: categoryId ?? null,
      stopToken: null,
    }
    setTimerState(newState)
  }, [])

  const pause = useCallback(() => {
    setTimerState((prev) => {
      if (prev.status !== 'running') return prev
      const now = Date.now()
      const intervalElapsed = prev.intervalStartedAt
        ? now - new Date(prev.intervalStartedAt).getTime()
        : 0

      return {
        ...prev,
        status: 'paused' as const,
        accumulatedMs: prev.accumulatedMs + intervalElapsed,
        intervalStartedAt: null,
      }
    })
  }, [])

  const resume = useCallback(() => {
    setTimerState((prev) => {
      if (prev.status !== 'paused') return prev
      return {
        ...prev,
        status: 'running' as const,
        intervalStartedAt: new Date().toISOString(),
      }
    })
  }, [])

  const stop = useCallback((): TimerSessionResult | null => {
    const currentState = timerState
    if (currentState.status === 'idle' || !currentState.startedAt || !currentState.skillId) {
      return null
    }

    const token = generateStopToken()
    if (currentState.stopToken && stoppedTokensRef.current.has(currentState.stopToken)) {
      return null
    }

    const now = new Date()
    const totalMs = computeElapsedMs(currentState)
    const durationMinutes = Math.max(1, Math.round(totalMs / 60_000))

    const result: TimerSessionResult = {
      startedAt: currentState.startedAt,
      endedAt: now.toISOString(),
      durationMinutes,
      skillId: currentState.skillId,
      categoryId: currentState.categoryId,
      stopToken: token,
    }

    stoppedTokensRef.current.add(token)

    const idleState = getInitialState()
    setTimerState(idleState)
    clearState()

    return result
  }, [timerState])

  const reset = useCallback(() => {
    setTimerState(getInitialState())
    clearState()
    setElapsedSeconds(0)
  }, [])

  return {
    status: timerState.status,
    elapsedSeconds,
    skillId: timerState.skillId,
    categoryId: timerState.categoryId,
    start,
    pause,
    resume,
    stop,
    reset,
    isActive: timerState.status !== 'idle',
  }
}
