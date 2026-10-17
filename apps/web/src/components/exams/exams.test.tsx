import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type {
  ActiveObjectiveContext,
  ExamScoreScale,
  ExamScoreScaleListResponse,
  ExamWithScale,
} from '@lingopath/types'
import { ExamCard } from '@/components/exams/exam-card'
import { ExamProgress } from '@/components/exams/exam-progress'
import { ExamsPageClient } from '@/components/exams/exams-page-client'
import { groupExams, formatScore, sortByExamDateDesc } from '@/lib/exams'

const IELTS_SCALE: ExamScoreScale = {
  key: 'IELTS_BAND',
  label: 'IELTS band',
  kind: 'BAND',
  min: 0,
  max: 9,
  step: 0.5,
  decimals: 1,
  targetLabel: 'Target band',
  sections: [
    { key: 'listening', label: 'Listening', max: 9 },
    { key: 'reading', label: 'Reading', max: 9 },
    { key: 'writing', label: 'Writing', max: 9 },
    { key: 'speaking', label: 'Speaking', max: 9 },
  ],
}

const TOEFL_SCALE: ExamScoreScale = {
  key: 'TOEFL_TOTAL',
  label: 'TOEFL iBT total score',
  kind: 'TOTAL',
  min: 0,
  max: 120,
  step: 1,
  decimals: 0,
  targetLabel: 'Target score',
  sections: [
    { key: 'listening', label: 'Listening', max: 30 },
    { key: 'reading', label: 'Reading', max: 30 },
    { key: 'writing', label: 'Writing', max: 30 },
    { key: 'speaking', label: 'Speaking', max: 30 },
  ],
}

function ieltsExam(overrides: Partial<ExamWithScale> = {}): ExamWithScale {
  return {
    id: 'exam-1',
    userId: 'user-1',
    objectiveId: 'obj-1',
    type: 'IELTS',
    title: 'IELTS Academic',
    scheduledAt: '2026-11-02T00:00:00.000Z',
    venue: 'Test centre',
    status: 'REGISTERED',
    targetScore: 7.5,
    targetDate: '2026-11-02T00:00:00.000Z',
    scoreScale: { key: 'IELTS_BAND' },
    notes: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    scale: IELTS_SCALE,
    scaleSource: 'EXAM',
    objective: { id: 'obj-1', title: 'IELTS 7.5' },
    results: [
      {
        id: 'res-2',
        examId: 'exam-1',
        isMock: true,
        takenAt: '2026-09-20T00:00:00.000Z',
        overallScore: 6.5,
        skillScores: { listening: 7, reading: 6.5, writing: 6, speaking: 6.5 },
        notes: null,
        createdAt: '2026-09-20T00:00:00.000Z',
        updatedAt: '2026-09-20T00:00:00.000Z',
      },
      {
        id: 'res-1',
        examId: 'exam-1',
        isMock: true,
        takenAt: '2026-08-01T00:00:00.000Z',
        overallScore: 6,
        skillScores: { listening: 6.5, reading: 6, writing: 5.5, speaking: 6 },
        notes: null,
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
      },
    ],
    ...overrides,
  }
}

function toeflExam(overrides: Partial<ExamWithScale> = {}): ExamWithScale {
  return {
    ...ieltsExam(),
    id: 'exam-2',
    type: 'TOEFL',
    title: 'TOEFL iBT',
    status: 'COMPLETED',
    scheduledAt: '2026-07-04T00:00:00.000Z',
    targetScore: 110,
    scoreScale: null,
    scale: TOEFL_SCALE,
    scaleSource: 'TYPE_DEFAULT',
    results: [
      {
        id: 'res-3',
        examId: 'exam-2',
        isMock: false,
        takenAt: '2026-07-04T00:00:00.000Z',
        overallScore: 110,
        skillScores: { listening: 30, reading: 28, writing: 26, speaking: 26 },
        notes: null,
        createdAt: '2026-07-04T00:00:00.000Z',
        updatedAt: '2026-07-04T00:00:00.000Z',
      },
    ],
    ...overrides,
  }
}

function objectiveContextFixture(): ActiveObjectiveContext {
  return {
    objective: {
      id: 'obj-1',
      userId: 'user-1',
      type: 'IELTS',
      title: 'IELTS 7.5',
      description: null,
      targetScore: 7.5,
      targetDate: '2026-11-02T00:00:00.000Z',
      isActive: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    status: 'SET',
    timezone: 'Europe/Berlin',
    today: '2026-10-16',
    daysUntilTargetDate: 17,
    isTargetDatePassed: false,
    linkedPlanCount: 1,
    linkedGoalCount: 1,
    linkedExams: [],
    latestRecordedResult: null,
    latestAssessment: null,
    signals: [],
  }
}

const SCALES_RESPONSE: ExamScoreScaleListResponse = {
  data: [IELTS_SCALE, TOEFL_SCALE],
  defaults: { IELTS: 'IELTS_BAND', TOEFL: 'TOEFL_TOTAL', OTHER: null },
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

describe('exam display helpers', () => {
  it('renders a score with the precision its own scale reports', () => {
    // IELTS is a half-band scale, TOEFL a whole-point one, and an exam without a
    // scale is shown as stored rather than padded to a precision nobody defined.
    expect(formatScore(7.5, IELTS_SCALE)).toBe('7.5')
    expect(formatScore(110, TOEFL_SCALE)).toBe('110')
    expect(formatScore(6, IELTS_SCALE)).toBe('6.0')
    expect(formatScore(6, null)).toBe('6')
    expect(formatScore(null, IELTS_SCALE)).toBe('—')
  })

  it('keeps exams with a future date ahead of the learner and files the rest as history', () => {
    const ongoing = ieltsExam()
    const done = toeflExam()
    const groups = groupExams([ongoing, done], '2026-10-16')

    expect(groups.upcoming.map((exam) => exam.id)).toEqual(['exam-1'])
    expect(groups.past.map((exam) => exam.id)).toEqual(['exam-2'])
  })

  it('files a planned exam whose date has passed as history', () => {
    const stale = ieltsExam({ scheduledAt: '2026-09-01T00:00:00.000Z', status: 'PLANNED' })
    const groups = groupExams([stale], '2026-10-16')

    expect(groups.upcoming).toHaveLength(0)
    expect(groups.past).toHaveLength(1)
  })

  it('sorts history by date, newest first, with undated exams last', () => {
    const dated = toeflExam({ id: 'dated', scheduledAt: '2026-05-01T00:00:00.000Z' })
    const recent = toeflExam({ id: 'recent', scheduledAt: '2026-09-01T00:00:00.000Z' })
    const undated = toeflExam({ id: 'undated', scheduledAt: null })

    expect(sortByExamDateDesc([undated, dated, recent]).map((exam) => exam.id)).toEqual([
      'recent',
      'dated',
      'undated',
    ])
  })
})

describe('ExamCard', () => {
  it('labels the target the way its scale does, and reports the latest recorded result', () => {
    render(
      <ExamCard exam={ieltsExam()} onEdit={() => {}} onDelete={() => {}} onRecordResult={() => {}} />,
    )

    expect(screen.getByText('Target band')).toBeDefined()
    expect(screen.getByText('7.5')).toBeDefined()
    // The test date and the target date are the same day here, so both cells match.
    expect(screen.getAllByText('Mon, Nov 2, 2026').length).toBe(2)
    expect(screen.getByText('IELTS band')).toBeDefined()
    expect(screen.getByText(/Latest recorded overall/)).toBeDefined()
    expect(screen.getAllByText('6.5').length).toBeGreaterThan(0)
    expect(screen.getByText(/Objective: IELTS 7\.5/)).toBeDefined()
  })

  it('shows a TOEFL total of 110 without clamping it', () => {
    render(
      <ExamCard exam={toeflExam()} onEdit={() => {}} onDelete={() => {}} onRecordResult={() => {}} />,
    )

    expect(screen.getByText('Target score')).toBeDefined()
    // The target and the recorded result are both 110 — proof neither is clamped.
    expect(screen.getAllByText('110').length).toBe(2)
  })

  it('asks for a result when none is recorded, and never grades the exam', () => {
    render(
      <ExamCard
        exam={ieltsExam({ results: [] })}
        onEdit={() => {}}
        onDelete={() => {}}
        onRecordResult={() => {}}
      />,
    )

    expect(screen.getByText(/No result recorded for this exam yet/)).toBeDefined()
    expect(screen.getByText('No results recorded yet')).toBeDefined()

    const text = document.body.textContent?.toLowerCase() ?? ''
    for (const banned of ['ready', 'weak', 'on track', 'behind schedule', 'will pass']) {
      expect(text).not.toContain(banned)
    }
  })
})

describe('ExamProgress', () => {
  it('charts every recorded result and marks the target as a reference line', () => {
    render(<ExamProgress exam={ieltsExam()} />)

    expect(screen.getByText('Recorded results')).toBeDefined()
    expect(screen.getByText('2 results recorded · target band 7.5')).toBeDefined()
    expect(
      screen.getByRole('img', { name: /Recorded scores for IELTS Academic across 2 results/ }),
    ).toBeDefined()
    expect(screen.getByText('Most recent result')).toBeDefined()
    expect(screen.getByText('Listening')).toBeDefined()
  })
})

describe('ExamsPageClient', () => {
  it('splits exams, shows the active objective, and claims nothing about readiness', async () => {
    stubRoutes({
      '/api/v1/exams/scales': SCALES_RESPONSE,
      '/api/v1/exams': { data: [ieltsExam(), toeflExam()], meta: { nextCursor: null, hasMore: false, limit: 100 } },
      '/api/v1/objectives/active': objectiveContextFixture(),
      '/api/v1/objectives': { data: [objectiveContextFixture().objective] },
    })

    renderWithQueryClient(<ExamsPageClient />)

    expect(await screen.findByText('Exams & mock tests')).toBeDefined()
    await waitFor(() => expect(screen.getByText('Ahead of you')).toBeDefined())

    expect(screen.getByText('History')).toBeDefined()
    expect(screen.getByText(/Active objective: IELTS 7\.5/)).toBeDefined()
    expect(screen.getByText(/does not predict a score and does not label you ready or not ready/)).toBeDefined()
    expect(screen.getByText(/Study time is tracked separately/)).toBeDefined()
  })

  it('offers to add the first exam when there are none', async () => {
    stubRoutes({
      '/api/v1/exams/scales': SCALES_RESPONSE,
      '/api/v1/exams': { data: [], meta: { nextCursor: null, hasMore: false, limit: 100 } },
      '/api/v1/objectives/active': objectiveContextFixture(),
      '/api/v1/objectives': { data: [] },
    })

    renderWithQueryClient(<ExamsPageClient />)

    expect(await screen.findByText('No exams yet')).toBeDefined()
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

    renderWithQueryClient(<ExamsPageClient />)

    expect(await screen.findByText('Could not load your exams')).toBeDefined()
    expect(screen.getByRole('button', { name: /try again/i })).toBeDefined()
  })
})
