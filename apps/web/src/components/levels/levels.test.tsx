import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ActiveObjectiveContext, LevelOverviewResponse, ObjectiveSignal } from '@lingopath/types'
import { AssessmentHistoryTable } from '@/components/levels/assessment-history-table'
import { LevelHistoryChart } from '@/components/levels/level-history-chart'
import { LevelSummaryCards } from '@/components/levels/level-summary-cards'
import { LevelsPageClient } from '@/components/levels/levels-page-client'
import { levelsByRank, previousRecordingLabel } from '@/lib/levels'

const RANK_BY_LEVEL = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 }

function overviewFixture(overrides: Partial<LevelOverviewResponse> = {}): LevelOverviewResponse {
  return {
    basis: 'RECORDED_ASSESSMENTS',
    timezone: 'Europe/Berlin',
    today: '2026-10-16',
    dimensions: ['overall', 'listening', 'reading', 'writing', 'speaking'],
    rankByLevel: RANK_BY_LEVEL,
    current: {
      overall: {
        dimension: 'overall',
        assessmentId: 'a2',
        level: 'B2',
        rank: 4,
        assessedAt: '2026-09-01T00:00:00.000Z',
        method: 'FORMAL_EXAM',
        previousLevel: 'B1',
        previousRank: 3,
        previousAssessedAt: '2026-02-01T00:00:00.000Z',
        changeDirection: 'up',
        changeSteps: 1,
      },
      listening: null,
      reading: {
        dimension: 'reading',
        assessmentId: 'a1',
        level: 'B1',
        rank: 3,
        assessedAt: '2026-02-01T00:00:00.000Z',
        method: 'SELF_REPORTED',
        previousLevel: null,
        previousRank: null,
        previousAssessedAt: null,
        changeDirection: null,
        changeSteps: null,
      },
      writing: null,
      speaking: null,
    },
    history: [
      {
        id: 'a2',
        userId: 'user-1',
        cefrLevel: 'B2',
        listeningLevel: null,
        readingLevel: 'B1',
        writingLevel: null,
        speakingLevel: null,
        assessedAt: '2026-09-01T00:00:00.000Z',
        method: 'FORMAL_EXAM',
        notes: 'Placement test',
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
        levels: { overall: 'B2', listening: null, reading: 'B1', writing: null, speaking: null },
      },
      {
        id: 'a1',
        userId: 'user-1',
        cefrLevel: null,
        listeningLevel: null,
        readingLevel: 'B1',
        writingLevel: null,
        speakingLevel: null,
        assessedAt: '2026-02-01T00:00:00.000Z',
        method: 'SELF_REPORTED',
        notes: null,
        createdAt: '2026-02-01T00:00:00.000Z',
        updatedAt: '2026-02-01T00:00:00.000Z',
        levels: { overall: null, listening: null, reading: 'B1', writing: null, speaking: null },
      },
    ],
    totalAssessments: 2,
    hasMore: false,
    nextCursor: null,
    limit: 50,
    ...overrides,
  }
}

function objectiveContextFixture(): ActiveObjectiveContext {
  const signals: ObjectiveSignal[] = [
    {
      id: 'target-date-soon',
      kind: 'TIMELINE',
      title: '16 days until your target date',
      detail: '“IELTS 7.5” is dated 2026-11-01. Today is 2026-10-16.',
      basedOn: 'Recorded target date 2026-11-01 against today (2026-10-16) in your timezone.',
    },
  ]

  return {
    objective: {
      id: 'obj-1',
      userId: 'user-1',
      type: 'IELTS',
      title: 'IELTS 7.5',
      description: null,
      targetScore: 7.5,
      targetDate: '2026-11-01T00:00:00.000Z',
      isActive: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    status: 'SET',
    timezone: 'Europe/Berlin',
    today: '2026-10-16',
    daysUntilTargetDate: 16,
    isTargetDatePassed: false,
    linkedPlanCount: 1,
    linkedGoalCount: 2,
    linkedExams: [],
    latestRecordedResult: null,
    latestAssessment: null,
    signals,
  }
}

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

function stubRoutes(routes: Record<string, unknown>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown) => {
      const url = new URL(String(input))
      const path = `${url.pathname}${url.search}`
      const match = Object.keys(routes)
        .sort((a, b) => b.length - a.length)
        .find((key) => path.startsWith(key))

      if (!match) {
        return {
          ok: false,
          status: 404,
          json: async () => ({ error: { code: 'NOT_FOUND', message: `no stub for ${path}` } }),
        }
      }

      return { ok: true, status: 200, json: async () => routes[match] }
    }),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('levels helpers', () => {
  it('derives the CEFR order from the rank map the API sends', () => {
    expect(levelsByRank({ C1: 5, A1: 1, B2: 4, A2: 2, C2: 6, B1: 3 })).toEqual([
      'A1',
      'A2',
      'B1',
      'B2',
      'C1',
      'C2',
    ])
  })

  it('describes an earlier recording, and nothing at all for a first one', () => {
    const current = overviewFixture().current

    expect(previousRecordingLabel(current.overall!)).toBe('Earlier recording: B1 · Feb 1')
    expect(previousRecordingLabel(current.reading!)).toBeNull()
  })
})

describe('LevelSummaryCards', () => {
  it('shows the recorded level with its date, and leaves unrecorded dimensions empty', () => {
    const payload = overviewFixture()
    render(
      <LevelSummaryCards dimensions={payload.dimensions} current={payload.current} />,
    )

    expect(screen.getByText('Overall')).toBeDefined()
    expect(screen.getByText('B2')).toBeDefined()
    expect(screen.getByText('Recorded Tue, Sep 1, 2026')).toBeDefined()
    expect(screen.getByText('Formal exam')).toBeDefined()
    expect(screen.getByText('Earlier recording: B1 · Feb 1')).toBeDefined()

    // Dimensions nobody assessed say so, three of them here.
    expect(screen.getAllByText('Not recorded')).toHaveLength(3)
  })
})

describe('LevelHistoryChart', () => {
  it('plots the recorded history and says a gap means "not assessed"', () => {
    const payload = overviewFixture()
    render(
      <LevelHistoryChart
        history={payload.history}
        dimensions={payload.dimensions}
        rankByLevel={payload.rankByLevel}
      />,
    )

    expect(screen.getByText('Level history')).toBeDefined()
    expect(screen.getByText(/2 recorded assessments/)).toBeDefined()
    expect(
      screen.getByRole('img', { name: /CEFR level history with 2 recorded assessments/ }),
    ).toBeDefined()
  })

  it('shows an empty state before anything is recorded', () => {
    const payload = overviewFixture()
    render(
      <LevelHistoryChart
        history={[]}
        dimensions={payload.dimensions}
        rankByLevel={payload.rankByLevel}
      />,
    )

    expect(screen.getByText('No assessments recorded')).toBeDefined()
  })
})

describe('AssessmentHistoryTable', () => {
  it('marks dimensions that were not assessed instead of leaving them blank', () => {
    const payload = overviewFixture()
    render(
      <AssessmentHistoryTable
        history={payload.history}
        dimensions={payload.dimensions}
        hasMore={false}
        total={payload.totalAssessments}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    )

    expect(screen.getByText('2 recorded assessments')).toBeDefined()
    expect(screen.getByText('Tue, Sep 1, 2026')).toBeDefined()
    expect(screen.getByText('Placement test')).toBeDefined()
    expect(screen.getAllByText('Not assessed').length).toBeGreaterThan(0)
  })

  it('asks before deleting, and only then reports the id', () => {
    const deleted: string[] = []
    const payload = overviewFixture()
    render(
      <AssessmentHistoryTable
        history={payload.history}
        dimensions={payload.dimensions}
        hasMore={false}
        total={payload.totalAssessments}
        onEdit={() => {}}
        onDelete={(id) => deleted.push(id)}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Delete assessment from 2026-09-01/ }))
    expect(deleted).toEqual([])

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(deleted).toEqual(['a2'])
  })
})

describe('LevelsPageClient', () => {
  it('loads the overview, states where the levels come from, and never grades the learner', async () => {
    const payload = overviewFixture()
    stubRoutes({
      '/api/v1/assessments/overview': payload,
      '/api/v1/objectives/active': objectiveContextFixture(),
      '/api/v1/objectives': { data: [objectiveContextFixture().objective] },
    })

    renderWithQueryClient(<LevelsPageClient />)

    expect(await screen.findByText('CEFR levels')).toBeDefined()
    await waitFor(() => expect(screen.getAllByText('B2').length).toBeGreaterThan(0))

    // Provenance is on screen, so the numbers are not mistaken for measurements
    // the app made on its own.
    expect(screen.getByText(/Levels here are the ones you record, and nothing else/)).toBeDefined()
    expect(screen.getByText(/does not label you ready or not ready/)).toBeDefined()

    // The active objective and its signals are part of the page.
    expect(screen.getByText('Current focus')).toBeDefined()
    expect((await screen.findAllByText(/IELTS 7\.5/)).length).toBeGreaterThan(0)
    expect(screen.getByText(/Based on: Recorded target date 2026-11-01/)).toBeDefined()

    const text = document.body.textContent?.toLowerCase() ?? ''
    for (const banned of ['you are ready', 'not ready to', 'your weakness', 'you are weak']) {
      expect(text).not.toContain(banned)
    }
  })

  it('offers to record the first assessment when there is no history', async () => {
    const payload = overviewFixture({
      history: [],
      totalAssessments: 0,
      current: {
        overall: null,
        listening: null,
        reading: null,
        writing: null,
        speaking: null,
      },
    })
    stubRoutes({
      '/api/v1/assessments/overview': payload,
      '/api/v1/objectives/active': objectiveContextFixture(),
      '/api/v1/objectives': { data: [] },
    })

    renderWithQueryClient(<LevelsPageClient />)

    expect(await screen.findByText('No assessments recorded yet')).toBeDefined()
    expect(screen.getAllByText('Not recorded')).toHaveLength(5)
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

    renderWithQueryClient(<LevelsPageClient />)

    expect(await screen.findByText('Could not load your levels')).toBeDefined()
    expect(screen.getByRole('button', { name: /try again/i })).toBeDefined()
  })
})
