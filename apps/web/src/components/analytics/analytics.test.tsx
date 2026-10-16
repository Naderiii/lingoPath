import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { AnalyticsPayload } from '@lingopath/types'
import { SummaryCards } from './summary-cards'
import { ComparisonPanel } from './comparison-panel'
import { SkillBreakdown } from './skill-breakdown'
import { PlanAnalytics } from './plan-analytics'
import { TrendChart } from './trend-chart'
import { AnalyticsPageClient } from './analytics-page-client'

function payloadFixture(overrides: Partial<AnalyticsPayload> = {}): AnalyticsPayload {
  return {
    range: {
      kind: '30d',
      from: '2026-09-17',
      to: '2026-10-16',
      days: 30,
      comparisonBasis: 'preceding-window',
    },
    previousRange: { from: '2026-08-18', to: '2026-09-16' },
    timezone: 'Europe/Berlin',
    summary: {
      totalMinutes: 600,
      totalMinutesFormatted: '10h',
      totalSessions: 12,
      activeDays: 9,
      inactiveDays: 21,
      daysInRange: 30,
      averageDailyMinutes: 20,
      averageSessionMinutes: 50,
      longestSession: {
        id: 'session-1',
        minutes: 120,
        minutesFormatted: '2h',
        date: '2026-10-14',
        skillId: 'grammar',
      },
      currentStreak: 3,
      longestStreak: 9,
      qualifyingMinutes: 20,
      dailyTargetMinutes: 60,
      daysMeetingTarget: 4,
      percentageOfDaysMeetingTarget: 13,
    },
    skills: [
      {
        skillId: 'grammar',
        name: 'Grammar',
        totalMinutes: 450,
        percentage: 75,
        sessions: 9,
        averageSessionMinutes: 50,
        trend: {
          current: 450,
          previous: 300,
          currentMinutes: 450,
          previousMinutes: 300,
          absolute: 150,
          changePercent: 50,
          zeroBaseline: false,
          direction: 'up',
        },
      },
      {
        skillId: 'listening',
        name: 'Listening',
        totalMinutes: 150,
        percentage: 25,
        sessions: 3,
        averageSessionMinutes: 50,
        trend: {
          current: 150,
          previous: 0,
          currentMinutes: 150,
          previousMinutes: 0,
          absolute: 150,
          changePercent: null,
          zeroBaseline: true,
          direction: 'up',
        },
      },
    ],
    trends: {
      granularity: 'day',
      points: [
        { bucket: '2026-10-14', minutes: 120, sessions: 2 },
        { bucket: '2026-10-15', minutes: 0, sessions: 0 },
      ],
    },
    comparison: {
      current: {
        from: '2026-09-17',
        to: '2026-10-16',
        totalMinutes: 600,
        totalSessions: 12,
        activeDays: 9,
        averageDailyMinutes: 20,
      },
      previous: {
        from: '2026-08-18',
        to: '2026-09-16',
        totalMinutes: 0,
        totalSessions: 0,
        activeDays: 0,
        averageDailyMinutes: 0,
      },
      deltas: {
        totalMinutes: {
          current: 600,
          previous: 0,
          absolute: 600,
          changePercent: null,
          zeroBaseline: true,
          direction: 'up',
        },
        totalSessions: {
          current: 12,
          previous: 0,
          absolute: 12,
          changePercent: null,
          zeroBaseline: true,
          direction: 'up',
        },
        activeDays: {
          current: 9,
          previous: 0,
          absolute: 9,
          changePercent: null,
          zeroBaseline: true,
          direction: 'up',
        },
        averageDailyMinutes: {
          current: 20,
          previous: 0,
          absolute: 20,
          changePercent: null,
          zeroBaseline: true,
          direction: 'up',
        },
      },
    },
    plans: [
      {
        planId: 'plan-1',
        title: '6-Month IELTS Preparation',
        objectiveTitle: 'IELTS Band 7.5',
        startDate: '2026-01-01T00:00:00.000Z',
        endDate: '2026-07-01T00:00:00.000Z',
        targetMinutes: 18000,
        actualMinutes: 9000,
        remainingMinutes: 9000,
        unassignedMinutes: 120,
        studyProgressPercent: 50,
        timeProgressPercent: 50,
        elapsedDays: 90,
        totalDays: 180,
        remainingDays: 90,
        paceStatus: 'on-track',
        requiredDailyMinutes: 100,
        milestones: [
          {
            milestoneId: 'ms-1',
            title: 'Foundations',
            status: 'ACTIVE',
            startDate: '2026-01-01T00:00:00.000Z',
            endDate: '2026-02-01T00:00:00.000Z',
            targetMinutes: 3000,
            actualMinutes: 1500,
            progressPercent: 50,
            remainingDays: 0,
            isCurrent: true,
            isNext: false,
          },
        ],
        monthly: [{ month: '2026-10', totalMinutes: 480 }],
        weekly: [{ weekStart: '2026-10-12', totalMinutes: 120 }],
      },
    ],
    goals: [
      {
        id: 'goal-1',
        period: 'DAILY',
        targetMinutes: 60,
        actualMinutes: 45,
        remainingMinutes: 15,
        percentage: 75,
        status: 'in_progress',
      },
    ],
    ...overrides,
  }
}

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe('SummaryCards', () => {
  it('renders every headline metric from the API payload', () => {
    render(<SummaryCards summary={payloadFixture().summary} />)

    expect(screen.getByText('Total study time')).toBeDefined()
    expect(screen.getByText('10h')).toBeDefined()
    expect(screen.getByText('12')).toBeDefined()
    expect(screen.getByText('9')).toBeDefined()
    expect(screen.getByText('2h')).toBeDefined()
    expect(screen.getByText('3 days')).toBeDefined()
    expect(screen.getByText('Longest 9 days')).toBeDefined()
    expect(screen.getByText('4')).toBeDefined()
    expect(screen.getByText('13% of days in this range reached the goal.')).toBeDefined()
  })
})

describe('ComparisonPanel', () => {
  it('never shows an infinite percentage for a zero baseline', () => {
    const fixture = payloadFixture()
    render(
      <ComparisonPanel
        comparison={fixture.comparison}
        previousRange={fixture.previousRange}
        currentRange={fixture.range}
      />,
    )

    expect(screen.getAllByText('New').length).toBeGreaterThan(0)
    expect(screen.queryByText(/Infinity|∞/)).toBeNull()
    expect(screen.getByText(/absolute change is shown instead/)).toBeDefined()
    expect(screen.getByText('+10h')).toBeDefined()
  })

  it('shows percentages when a baseline exists', () => {
    const fixture = payloadFixture()
    const withBaseline: AnalyticsPayload['comparison'] = {
      current: fixture.comparison.current,
      previous: {
        from: '2026-08-18',
        to: '2026-09-16',
        totalMinutes: 400,
        totalSessions: 8,
        activeDays: 6,
        averageDailyMinutes: 15,
      },
      deltas: {
        totalMinutes: {
          current: 600,
          previous: 400,
          absolute: 200,
          changePercent: 50,
          zeroBaseline: false,
          direction: 'up',
        },
        totalSessions: {
          current: 12,
          previous: 8,
          absolute: 4,
          changePercent: 50,
          zeroBaseline: false,
          direction: 'up',
        },
        activeDays: {
          current: 9,
          previous: 6,
          absolute: 3,
          changePercent: 50,
          zeroBaseline: false,
          direction: 'up',
        },
        averageDailyMinutes: {
          current: 20,
          previous: 15,
          absolute: 5,
          changePercent: 33.3,
          zeroBaseline: false,
          direction: 'up',
        },
      },
    }

    render(
      <ComparisonPanel
        comparison={withBaseline}
        previousRange={fixture.previousRange}
        currentRange={fixture.range}
      />,
    )

    expect(screen.getAllByText('+50%').length).toBeGreaterThan(0)
    expect(screen.getByText('+33.3%')).toBeDefined()
    expect(screen.queryByText('New')).toBeNull()
  })
})

describe('SkillBreakdown', () => {
  it('renders shares, averages and trends, marking a skill with no baseline', () => {
    render(<SkillBreakdown skills={payloadFixture().skills} />)

    expect(screen.getByText('Grammar')).toBeDefined()
    expect(screen.getByText('75%')).toBeDefined()
    expect(screen.getByText('9')).toBeDefined()
    expect(screen.getByText('+50%')).toBeDefined()
    // Listening had no previous activity → "New", not an infinite change.
    expect(screen.getByText('New')).toBeDefined()
  })

  it('shows an empty state without skills', () => {
    render(<SkillBreakdown skills={[]} />)

    expect(screen.getByText('No skills recorded in this range')).toBeDefined()
  })
})

describe('TrendChart', () => {
  it('plots the API series', () => {
    render(<TrendChart points={payloadFixture().trends.points} granularity="day" />)

    expect(screen.getByText('Daily study time')).toBeDefined()
    expect(screen.getByText('2 days in this range')).toBeDefined()
  })

  it('explains an empty series instead of drawing a misleading scale', () => {
    render(
      <TrendChart
        points={[
          { bucket: '2026-10-14', minutes: 0, sessions: 0 },
          { bucket: '2026-10-15', minutes: 0, sessions: 0 },
        ]}
        granularity="day"
      />,
    )

    expect(screen.getByText('No study time in this range')).toBeDefined()
  })
})

describe('PlanAnalytics', () => {
  it('answers "am I keeping up" with planned vs actual, pacing and milestones', () => {
    render(<PlanAnalytics plans={payloadFixture().plans} />)

    expect(screen.getByText('6-Month IELTS Preparation')).toBeDefined()
    expect(screen.getByText('On track')).toBeDefined()
    expect(screen.getByText(/on track\./)).toBeDefined()
    expect(screen.getByText('Planned vs actual')).toBeDefined()
    expect(screen.getByText('Time elapsed vs study progress')).toBeDefined()
    expect(screen.getByText('150h of 300h')).toBeDefined()
    expect(screen.getByText('Foundations')).toBeDefined()
    expect(screen.getByText('Current')).toBeDefined()
    expect(screen.getByText('Monthly performance')).toBeDefined()
    expect(screen.getByText('Weekly performance')).toBeDefined()
    expect(screen.getByText('2h', { selector: 'p' })).toBeDefined()
  })

  it('shows an empty state without plans', () => {
    render(<PlanAnalytics plans={[]} />)

    expect(screen.getByText('No active long-term plans')).toBeDefined()
  })
})

describe('AnalyticsPageClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads the consolidated payload and renders every section', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => payloadFixture(),
    }))
    vi.stubGlobal('fetch', fetchMock)

    renderWithQueryClient(<AnalyticsPageClient />)

    expect(await screen.findByText('Total study time')).toBeDefined()
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const calledUrl = String((fetchMock.mock.calls[0] as unknown[])[0])
    expect(calledUrl).toContain('/api/v1/analytics?range=30d')

    expect(screen.getByText('Skill breakdown')).toBeDefined()
    expect(screen.getByText('Current vs previous period')).toBeDefined()
    expect(screen.getByText('Long-term plans')).toBeDefined()
    expect(screen.getByText('Goal progress')).toBeDefined()
    expect(screen.getByRole('button', { name: '7 days' })).toBeDefined()
  })

  it('shows the empty state when the range has no sessions', async () => {
    const empty = payloadFixture()
    empty.summary = {
      ...empty.summary,
      totalMinutes: 0,
      totalMinutesFormatted: '0m',
      totalSessions: 0,
      activeDays: 0,
      inactiveDays: 30,
      daysMeetingTarget: 0,
      percentageOfDaysMeetingTarget: 0,
      longestSession: null,
      currentStreak: 0,
      longestStreak: 0,
    }
    empty.skills = []
    empty.trends = { granularity: 'day', points: [] }
    empty.plans = []
    empty.goals = []

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => empty })),
    )

    renderWithQueryClient(<AnalyticsPageClient />)

    expect(await screen.findByText('No study recorded in this range')).toBeDefined()
  })

  it('surfaces a failed request with a retry action', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'boom' } }),
      })),
    )

    renderWithQueryClient(<AnalyticsPageClient />)

    expect(await screen.findByText('Could not load analytics')).toBeDefined()
    expect(screen.getByRole('button', { name: /try again/i })).toBeDefined()
  })
})
