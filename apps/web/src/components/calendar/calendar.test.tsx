import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type {
  CalendarDay,
  CalendarDayDetailResponse,
  CalendarIntensityLevel,
} from '@lingopath/types'
import { StudyHeatmap } from './study-heatmap'
import { StreakCards } from './streak-cards'
import { DayDetailContent, DayDetailDialog, formatTimeRange } from './day-detail-dialog'
import {
  CalendarSettingsForm,
  describeFormLevels,
  validateSettingsForm,
} from './calendar-settings-dialog'

const LEVELS: CalendarIntensityLevel[] = [
  { level: 0, minMinutes: 0, maxMinutes: 0, label: 'No study' },
  { level: 1, minMinutes: 1, maxMinutes: 20, label: '1–20 min' },
  { level: 2, minMinutes: 21, maxMinutes: 40, label: '21–40 min' },
  { level: 3, minMinutes: 41, maxMinutes: 60, label: '41–60 min' },
  { level: 4, minMinutes: 61, maxMinutes: 90, label: '61–90 min' },
  { level: 5, minMinutes: 91, maxMinutes: null, label: '91+ min' },
]

function makeDays(spec: Record<string, { minutes: number; sessions: number }>): CalendarDay[] {
  return Object.entries(spec)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, entry]) => ({
      date,
      totalMinutes: entry.minutes,
      sessionCount: entry.sessions,
      intensity: levelFor(entry.minutes),
      qualified: entry.minutes >= 20,
    }))
}

function levelFor(minutes: number): number {
  if (minutes <= 0) return 0
  if (minutes <= 20) return 1
  if (minutes <= 40) return 2
  if (minutes <= 60) return 3
  if (minutes <= 90) return 4
  return 5
}

/** Every day of a range, the way the calendar endpoint returns them. */
function makeFullRange(
  from: string,
  to: string,
  spec: Record<string, { minutes: number; sessions: number }>,
): CalendarDay[] {
  const days: CalendarDay[] = []
  let cursor = from

  while (cursor <= to) {
    const minutes = spec[cursor]?.minutes ?? 0
    days.push({
      date: cursor,
      totalMinutes: minutes,
      sessionCount: spec[cursor]?.sessions ?? 0,
      intensity: levelFor(minutes),
      qualified: minutes >= 20,
    })
    cursor = addDays(cursor, 1)
  }

  return days
}

function addDays(dayKey: string, days: number): string {
  const [year, month, day] = dayKey.split('-').map(Number)
  const shifted = new Date(Date.UTC(year!, month! - 1, day!) + days * 86_400_000)
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`
}

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })

  return {
    queryClient,
    ...render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>),
  }
}

describe('StudyHeatmap', () => {
  const days = makeDays({
    '2026-10-14': { minutes: 45, sessions: 2 },
    '2026-10-15': { minutes: 0, sessions: 0 },
    '2026-10-16': { minutes: 95, sessions: 3 },
  })

  // Two full weeks of real days, the way the calendar endpoint returns them, so
  // keyboard navigation has neighbouring days in every direction.
  const twoWeeks = makeFullRange('2026-10-05', '2026-10-20', {
    '2026-10-05': { minutes: 30, sessions: 1 },
    '2026-10-09': { minutes: 45, sessions: 1 },
    '2026-10-15': { minutes: 20, sessions: 1 },
    '2026-10-16': { minutes: 60, sessions: 2 },
    '2026-10-20': { minutes: 15, sessions: 1 },
  })

  it('renders one button per day with a full accessible label', () => {
    render(
      <StudyHeatmap days={days} levels={LEVELS} today="2026-10-16" onSelectDay={() => undefined} />,
    )

    expect(
      screen.getByRole('button', {
        name: 'Fri, Oct 16, 2026: 1h 35m of study, 3 sessions, counts toward streak, intensity 91+ min',
      }),
    ).toBeDefined()
    expect(
      screen.getByRole('button', {
        name: /Thu, Oct 15, 2026: 0m of study, 0 sessions, intensity No study/,
      }),
    ).toBeDefined()

    // Padding cells are not interactive.
    expect(screen.getAllByRole('button')).toHaveLength(3)
  })

  it('reports the clicked day', () => {
    const onSelectDay = vi.fn()
    render(
      <StudyHeatmap days={days} levels={LEVELS} today="2026-10-16" onSelectDay={onSelectDay} />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Wed, Oct 14, 2026/ }))

    expect(onSelectDay).toHaveBeenCalledWith('2026-10-14')
  })

  it('marks the selected day with aria-pressed', () => {
    render(
      <StudyHeatmap
        days={days}
        levels={LEVELS}
        today="2026-10-16"
        selectedDate="2026-10-14"
        onSelectDay={() => undefined}
      />,
    )

    expect(
      screen.getByRole('button', { name: /Wed, Oct 14, 2026/ }).getAttribute('aria-pressed'),
    ).toBe('true')
    expect(
      screen.getByRole('button', { name: /Fri, Oct 16, 2026/ }).getAttribute('aria-pressed'),
    ).toBe('false')
  })

  it('moves focus with the arrow keys', () => {
    render(
      <StudyHeatmap
        days={twoWeeks}
        levels={LEVELS}
        today="2026-10-16"
        onSelectDay={() => undefined}
      />,
    )

    const activeLabel = () => document.activeElement?.getAttribute('aria-label') ?? null

    const start = screen.getByRole('button', { name: /Fri, Oct 16, 2026/ })
    start.focus()
    expect(activeLabel()).toContain('Fri, Oct 16, 2026')

    // One weekday up within the same week.
    fireEvent.keyDown(start, { key: 'ArrowUp' })
    expect(activeLabel()).toContain('Thu, Oct 15, 2026')

    // One week back — and forward again.
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowLeft' })
    expect(activeLabel()).toContain('Thu, Oct 8, 2026')

    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowRight' })
    expect(activeLabel()).toContain('Thu, Oct 15, 2026')

    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowDown' })
    expect(activeLabel()).toContain('Fri, Oct 16, 2026')
  })

  it('ignores arrow keys that would leave the rendered range', () => {
    render(
      <StudyHeatmap
        days={twoWeeks}
        levels={LEVELS}
        today="2026-10-16"
        onSelectDay={() => undefined}
      />,
    )

    const first = screen.getByRole('button', { name: /Mon, Oct 5, 2026/ })
    first.focus()
    fireEvent.keyDown(first, { key: 'ArrowUp' })

    // The cell above is padding, so focus stays put instead of wrapping.
    expect(document.activeElement?.getAttribute('aria-label')).toContain('Mon, Oct 5, 2026')
  })

  it('shows the legend from the configured thresholds', () => {
    render(
      <StudyHeatmap days={days} levels={LEVELS} today="2026-10-16" onSelectDay={() => undefined} />,
    )

    expect(screen.getByText('Less')).toBeDefined()
    expect(screen.getByText('More')).toBeDefined()
    expect(screen.getByText('91+ min')).toBeDefined()
    expect(screen.getByText('No study')).toBeDefined()
  })

  it('degrades gracefully for an empty range', () => {
    render(
      <StudyHeatmap days={[]} levels={LEVELS} today="2026-10-16" onSelectDay={() => undefined} />,
    )

    expect(screen.getByText('No days to display for this range.')).toBeDefined()
  })
})

describe('StreakCards', () => {
  it('renders current, longest and today standings', () => {
    render(
      <StreakCards
        streak={{
          timezone: 'America/New_York',
          qualifyingMinutes: 20,
          currentStreak: 4,
          longestStreak: 12,
          currentStreakStart: '2026-10-13',
          currentStreakEnd: '2026-10-16',
          longestStreakStart: '2026-09-01',
          longestStreakEnd: '2026-09-12',
          today: '2026-10-16',
          todayMinutes: 35,
          todayQualified: true,
          todayPending: false,
          lastQualifiedDate: '2026-10-16',
          totalQualifiedDays: 30,
          minutesToQualifyToday: 0,
        }}
      />,
    )

    expect(screen.getByText('Current streak')).toBeDefined()
    expect(screen.getByText('4')).toBeDefined()
    expect(screen.getByText('Longest streak')).toBeDefined()
    expect(screen.getByText('12')).toBeDefined()
    expect(screen.getByText('Oct 13 – Oct 16')).toBeDefined()
    expect(screen.getByText('Today counts toward your streak.')).toBeDefined()
    expect(screen.getByText(/Days are measured in America\/New_York/)).toBeDefined()
  })

  it('explains how much study is left today', () => {
    render(
      <StreakCards
        streak={{
          timezone: 'UTC',
          qualifyingMinutes: 20,
          currentStreak: 0,
          longestStreak: 0,
          currentStreakStart: null,
          currentStreakEnd: null,
          longestStreakStart: null,
          longestStreakEnd: null,
          today: '2026-10-16',
          todayMinutes: 5,
          todayQualified: false,
          todayPending: false,
          lastQualifiedDate: null,
          totalQualifiedDays: 0,
          minutesToQualifyToday: 15,
        }}
      />,
    )

    expect(screen.getAllByText('15m of study today starts a new streak.').length).toBeGreaterThan(0)
    expect(screen.getByText('No streak yet')).toBeDefined()
  })
})

describe('DayDetailContent', () => {
  function detailFixture(
    overrides: Partial<CalendarDayDetailResponse> = {},
  ): CalendarDayDetailResponse {
    return {
      date: '2026-10-16',
      timezone: 'America/New_York',
      totalMinutes: 85,
      sessionCount: 2,
      intensity: 4,
      qualified: true,
      streakQualifyingMinutes: 20,
      intensityThresholds: [20, 40, 60, 90],
      firstSessionLocalTime: '09:30',
      lastSessionLocalTime: '11:15',
      skills: [
        {
          skillId: 'skill-grammar',
          name: 'Grammar',
          minutes: 60,
          sessionCount: 1,
          percentage: 71,
        },
        {
          skillId: 'skill-listening',
          name: 'Listening',
          minutes: 25,
          sessionCount: 1,
          percentage: 29,
        },
      ],
      categories: [
        {
          categoryId: 'category-ielts',
          name: 'IELTS',
          minutes: 60,
          sessionCount: 1,
          percentage: 71,
        },
        { categoryId: null, name: 'Uncategorised', minutes: 25, sessionCount: 1, percentage: 29 },
      ],
      topics: [{ topic: 'Articles', minutes: 60, sessionCount: 1, percentage: 71 }],
      notes: [
        {
          sessionId: 'session-1',
          topic: 'Articles',
          notes: 'Reviewed definite vs indefinite articles.',
          durationMinutes: 60,
          startedAt: '2026-10-16T13:30:00.000Z',
        },
      ],
      sessions: [
        {
          id: 'session-1',
          startedAt: '2026-10-16T13:30:00.000Z',
          endedAt: '2026-10-16T14:30:00.000Z',
          durationMinutes: 60,
          skillId: 'skill-grammar',
          skillName: 'Grammar',
          categoryId: 'category-ielts',
          categoryName: 'IELTS',
          topic: 'Articles',
          description: null,
          notes: 'Reviewed definite vs indefinite articles.',
          selfRating: 4,
          isManual: false,
          planId: 'plan-1',
          planTitle: '6-Month IELTS Preparation',
          milestoneId: 'milestone-1',
          milestoneTitle: 'Grammar foundations',
        },
        {
          id: 'session-2',
          startedAt: '2026-10-16T15:00:00.000Z',
          endedAt: '2026-10-16T15:25:00.000Z',
          durationMinutes: 25,
          skillId: 'skill-listening',
          skillName: 'Listening',
          categoryId: null,
          categoryName: null,
          topic: null,
          description: 'Podcast',
          notes: null,
          selfRating: null,
          isManual: true,
          planId: null,
          planTitle: null,
          milestoneId: null,
          milestoneTitle: null,
        },
      ],
      ...overrides,
    }
  }

  it('renders totals, breakdowns, notes and sessions', () => {
    render(<DayDetailContent detail={detailFixture()} levels={LEVELS} />)

    expect(screen.getByText('1h 25m')).toBeDefined()
    expect(screen.getByText('Counted toward streak')).toBeDefined()
    expect(screen.getByText('61–90 min')).toBeDefined()
    expect(screen.getByText('09:30 – 11:15')).toBeDefined()

    // Skill and topic names appear in the breakdowns and again in the session list.
    expect(screen.getAllByText('Grammar').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Listening').length).toBeGreaterThan(0)
    expect(screen.getAllByText('IELTS').length).toBeGreaterThan(0)
    expect(screen.getByText('Uncategorised')).toBeDefined()
    expect(screen.getAllByText('Articles').length).toBeGreaterThan(0)

    expect(screen.getAllByText('Reviewed definite vs indefinite articles.').length).toBeGreaterThan(
      0,
    )
    expect(screen.getByText('Plan: 6-Month IELTS Preparation · Grammar foundations')).toBeDefined()
    expect(screen.getByText('Rated 4/5')).toBeDefined()
    expect(screen.getByText('manual')).toBeDefined()
  })

  it('explains a day that fell short of the streak rule', () => {
    render(
      <DayDetailContent
        detail={detailFixture({ totalMinutes: 15, qualified: false, intensity: 1 })}
        levels={LEVELS}
      />,
    )

    expect(screen.getByText('5m short of streak')).toBeDefined()
  })

  it('shows the empty state for a day without sessions', () => {
    render(
      <DayDetailContent
        detail={detailFixture({
          totalMinutes: 0,
          sessionCount: 0,
          intensity: 0,
          qualified: false,
          firstSessionLocalTime: null,
          lastSessionLocalTime: null,
          skills: [],
          categories: [],
          topics: [],
          notes: [],
          sessions: [],
        })}
        levels={LEVELS}
      />,
    )

    expect(screen.getByText('No study on this day')).toBeDefined()
    expect(screen.getByText('No sessions')).toBeDefined()
  })

  it('formats session time ranges in the user’s timezone', () => {
    expect(
      formatTimeRange('2026-10-16T13:30:00.000Z', '2026-10-16T14:30:00.000Z', 'America/New_York'),
    ).toBe('09:30 – 10:30')
    expect(
      formatTimeRange('2026-10-16T13:30:00.000Z', '2026-10-16T14:30:00.000Z', 'Asia/Tokyo'),
    ).toBe('22:30 – 23:30')
  })
})

describe('DayDetailDialog', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches the day from the API and renders it', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        date: '2026-10-16',
        timezone: 'UTC',
        totalMinutes: 30,
        sessionCount: 1,
        intensity: 2,
        qualified: true,
        streakQualifyingMinutes: 20,
        intensityThresholds: [20, 40, 60, 90],
        firstSessionLocalTime: '10:00',
        lastSessionLocalTime: '10:30',
        skills: [
          { skillId: 'skill-1', name: 'Grammar', minutes: 30, sessionCount: 1, percentage: 100 },
        ],
        categories: [],
        topics: [],
        notes: [],
        sessions: [],
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    renderWithQueryClient(
      <DayDetailDialog date="2026-10-16" levels={LEVELS} onClose={() => undefined} />,
    )

    expect(await screen.findByText('Fri, Oct 16, 2026')).toBeDefined()
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())

    const calledUrl = String((fetchMock.mock.calls[0] as unknown[])[0])
    expect(calledUrl).toContain('/api/v1/calendar/day/2026-10-16')
  })

  it('stays idle until a day is selected', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    renderWithQueryClient(<DayDetailDialog date={null} levels={LEVELS} onClose={() => undefined} />)

    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('CalendarSettingsForm', () => {
  it('validates bounds and the qualifying rule', () => {
    expect(
      validateSettingsForm({ thresholds: ['20', '40', '60', '90'], qualifyingMinutes: '20' }),
    ).toEqual({ thresholds: [20, 40, 60, 90], qualifyingMinutes: 20, error: null })

    expect(
      validateSettingsForm({ thresholds: ['40', '20'], qualifyingMinutes: '20' }).error,
    ).toMatch(/increase/i)
    expect(
      validateSettingsForm({ thresholds: ['20', '20'], qualifyingMinutes: '20' }).error,
    ).toMatch(/unique/i)
    expect(
      validateSettingsForm({ thresholds: ['20', 'abc'], qualifyingMinutes: '20' }).error,
    ).toMatch(/whole number/i)
    expect(validateSettingsForm({ thresholds: ['20', ''], qualifyingMinutes: '20' }).error).toMatch(
      /whole number/i,
    )
    expect(validateSettingsForm({ thresholds: [], qualifyingMinutes: '20' }).error).toMatch(
      /at least one/i,
    )
    expect(validateSettingsForm({ thresholds: ['20'], qualifyingMinutes: '-5' }).error).toMatch(
      /between 0/i,
    )
    expect(validateSettingsForm({ thresholds: ['20'], qualifyingMinutes: '1441' }).error).toMatch(
      /between 0/i,
    )
    expect(validateSettingsForm({ thresholds: ['20'], qualifyingMinutes: '0' })).toEqual({
      thresholds: [20],
      qualifyingMinutes: 0,
      error: null,
    })
  })

  it('previews the scale the form would produce', () => {
    expect(describeFormLevels(['20', '40']).map((level) => level.label)).toEqual([
      'No study',
      '1–20 min',
      '21–40 min',
      '41+ min',
    ])
    expect(describeFormLevels([])).toEqual([])
  })

  it('seeds its fields from the stored settings', () => {
    renderWithQueryClient(
      <CalendarSettingsForm
        settings={{
          timezone: 'UTC',
          today: '2026-10-16',
          intensityThresholds: [15, 30],
          intensityLevels: [],
          streakQualifyingMinutes: 45,
          source: 'USER',
          updatedAt: '2026-10-01T00:00:00.000Z',
        }}
        onSaved={() => undefined}
        onCancel={() => undefined}
      />,
    )

    expect(screen.getByLabelText('Intensity bound 1')).toHaveProperty('value', '15')
    expect(screen.getByLabelText('Intensity bound 2')).toHaveProperty('value', '30')
    expect(screen.getByLabelText('A day counts as a streak day at (minutes)')).toHaveProperty(
      'value',
      '45',
    )
    expect(screen.getByText('1–15 min')).toBeDefined()
    expect(screen.getByText('16–30 min')).toBeDefined()
    expect(screen.getByText('31+ min')).toBeDefined()
  })

  it('explains why a bad form cannot be saved', () => {
    renderWithQueryClient(
      <CalendarSettingsForm
        settings={undefined}
        onSaved={() => undefined}
        onCancel={() => undefined}
      />,
    )

    fireEvent.change(screen.getByLabelText('Intensity bound 1'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: /save thresholds/i }))

    expect(screen.getByText(/whole number of minutes above zero/i)).toBeDefined()
  })
})
