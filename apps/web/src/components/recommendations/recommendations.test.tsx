import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Recommendation, RecommendationHistoryEntry } from '@lingopath/types'
import { RecommendationBoundary } from './recommendation-boundary'
import { RecommendationPanel } from './recommendation-panel'
import { RecommendationHistoryPageClient } from './recommendation-history-page-client'
import { RecommendationsPageClient } from './recommendations-page-client'

/**
 * Behaviour of the suggestion surface, from the learner's side.
 *
 * The important assertions are about what does *not* happen: opening the
 * confirmation dialog, or dismissing it, must leave the plan alone. Every request
 * is inspected, so "nothing was written" is checked against the wire rather than
 * against a rendered label.
 */

interface Call {
  url: string
  method: string
  body: Record<string, unknown> | undefined
}

function makeRecommendation(overrides: Partial<Recommendation> = {}): Recommendation {
  return {
    id: 'rec-1',
    type: 'SKILL',
    title: 'Practise Writing again',
    recommendation: 'Add one 45-minute writing session this week.',
    rationale: 'Your last writing session was 19 days ago.',
    supportingData: [
      { label: 'Last writing session', value: '19 days ago', source: 'STUDY_SESSIONS' },
    ],
    confidence: 'MEDIUM',
    confidenceBasis:
      'MEDIUM: your recorded Writing activity shows a clear pattern across the recorded window. A coarse band, not a probability.',
    estimatedDurationMinutes: 45,
    relatedSkillId: 'skill-writing',
    relatedSkillName: 'Writing',
    relatedGoalId: null,
    relatedPlanId: null,
    generatedAt: '2026-10-17T08:00:00.000Z',
    status: 'NEW',
    source: 'RULE_BASED',
    decidedAt: null,
    appliedAt: null,
    appliedGoalId: null,
    expiresAt: '2026-10-24T08:00:00.000Z',
    suggestedAction: {
      kind: 'CREATE_GOAL',
      period: 'WEEKLY',
      targetMinutes: 90,
      skillId: 'skill-writing',
      relatedGoalId: null,
    },
    ...overrides,
  }
}

function statusFor(action: unknown): Recommendation['status'] {
  switch (action) {
    case 'REJECTED':
      return 'REJECTED'
    case 'POSTPONED':
      return 'POSTPONED'
    case 'MODIFIED':
      return 'MODIFIED'
    default:
      return 'ACCEPTED'
  }
}

function installApi(initial: Recommendation[], history: RecommendationHistoryEntry[] = []) {
  const state = { items: [...initial], calls: [] as Call[] }

  const respond = (payload: unknown, status = 200) => ({
    ok: status < 400,
    status,
    json: async () => payload,
  })

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = (init?.method ?? 'GET').toUpperCase()
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined
    state.calls.push({ url, method, body })

    if (url.includes('/api/v1/skills')) {
      return respond({
        data: [
          { id: 'skill-writing', name: 'Writing', sortOrder: 1 },
          { id: 'skill-reading', name: 'Reading', sortOrder: 2 },
        ],
      })
    }

    if (method === 'POST' && url.endsWith('/generate')) {
      const fresh = [
        makeRecommendation({
          id: 'rec-new',
          title: 'Protect your streak',
          type: 'CONSISTENCY',
        }),
      ]
      state.items = fresh
      return respond(
        {
          data: fresh,
          meta: {
            generatedAt: '2026-10-17T09:00:00.000Z',
            objectiveId: null,
            objectiveType: null,
            source: 'RULE_BASED',
            llm: { attempted: false, available: false, reason: 'No provider configured.' },
            confidenceCeiling: 'LOW',
            dataQuality: {
              level: 'LOW',
              sessionCount: 0,
              activeDays: 0,
              assessmentRecorded: false,
              examResultRecorded: false,
              notes: [],
            },
            considered: 1,
            suppressed: 0,
            rejectedByValidation: 0,
            notes: [],
          },
        },
        201,
      )
    }

    if (url.includes('/recommendations/history')) {
      return respond({ data: history, meta: { count: history.length, limit: 30 } })
    }

    const feedbackMatch = url.match(/\/recommendations\/([^/]+)\/feedback$/)
    if (method === 'POST' && feedbackMatch !== null) {
      const item = state.items.find((entry) => entry.id === feedbackMatch[1])
      const updated: Recommendation = {
        ...(item ?? makeRecommendation()),
        status: statusFor(body?.['action']),
        decidedAt: '2026-10-17T09:00:00.000Z',
      }
      state.items = state.items.map((entry) => (entry.id === updated.id ? updated : entry))
      return respond(
        {
          data: updated,
          meta: {
            followUp: {
              question: 'Add this to your plan?',
              canApply: true,
              action: updated.suggestedAction,
            },
          },
        },
        201,
      )
    }

    const applyMatch = url.match(/\/recommendations\/([^/]+)\/apply$/)
    if (method === 'POST' && applyMatch !== null) {
      const item = state.items.find((entry) => entry.id === applyMatch[1])
      const updated: Recommendation = {
        ...(item ?? makeRecommendation()),
        appliedAt: '2026-10-17T09:00:00.000Z',
        appliedGoalId: 'goal-1',
      }
      state.items = state.items.map((entry) => (entry.id === updated.id ? updated : entry))
      return respond({ data: updated, meta: { goalId: 'goal-1' } }, 201)
    }

    if (method === 'GET' && url.includes('/api/v1/recommendations')) {
      return respond({ data: state.items, meta: { count: state.items.length, limit: 20 } })
    }

    return respond({})
  })

  vi.stubGlobal('fetch', fetchMock)
  return state
}

function installFailingApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'boom' } }),
    })),
  )
}

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay: 0, gcTime: 0 } },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

function postsTo(state: { calls: Call[] }, suffix: string): Call[] {
  return state.calls.filter((call) => call.method === 'POST' && call.url.endsWith(suffix))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('suggestion panel', () => {
  it('shows at most three, each with its reason, evidence, duration, confidence and skill', async () => {
    const api = installApi([
      makeRecommendation({ id: 'rec-1', title: 'Practise Writing again' }),
      makeRecommendation({ id: 'rec-2', title: 'Protect your streak', type: 'CONSISTENCY' }),
      makeRecommendation({ id: 'rec-3', title: 'Rebalance towards Reading', type: 'BALANCE' }),
      makeRecommendation({ id: 'rec-4', title: 'A fourth suggestion', type: 'DURATION' }),
    ])

    renderWithClient(<RecommendationPanel limit={3} />)

    expect(await screen.findByText('Practise Writing again')).toBeDefined()
    expect(screen.getByText('Protect your streak')).toBeDefined()
    expect(screen.getByText('Rebalance towards Reading')).toBeDefined()
    expect(screen.queryByText('A fourth suggestion')).toBeNull()

    expect(
      screen.getAllByText('Your last writing session was 19 days ago.').length,
    ).toBeGreaterThan(0)
    expect(screen.getAllByText('19 days ago').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Study sessions').length).toBeGreaterThan(0)
    expect(screen.getAllByText('45m').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Confidence: Moderate').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Writing').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/coarse band, not a probability/).length).toBeGreaterThan(0)

    // The list was capped before rendering, so the fourth row was never in the DOM.
    expect(api.items).toHaveLength(4)
  })

  it('asks before it touches the plan, and only writes after the confirmation', async () => {
    const api = installApi([makeRecommendation()])

    renderWithClient(<RecommendationPanel limit={3} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Accept: Practise Writing again' }))

    expect(await screen.findByText('Add this to today’s plan?')).toBeDefined()

    // The decision is recorded; the plan is not touched.
    await waitFor(() => expect(postsTo(api, '/feedback')).toHaveLength(1))
    expect(postsTo(api, '/feedback')[0]?.body).toEqual({ action: 'ACCEPTED' })
    expect(postsTo(api, '/apply')).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: 'Add to today’s plan' }))

    await waitFor(() => expect(postsTo(api, '/apply')).toHaveLength(1))
    expect(postsTo(api, '/apply')[0]?.body).toMatchObject({
      confirm: true,
      period: 'DAILY',
      targetMinutes: 45,
      skillId: 'skill-writing',
    })

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('Added to your plan'),
    )
  })

  it('lets the learner change duration, skill, topic and day before confirming', async () => {
    const api = installApi([makeRecommendation()])

    renderWithClient(<RecommendationPanel limit={3} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Modify: Practise Writing again' }))

    const duration = await screen.findByLabelText('Duration (minutes)')
    await screen.findByRole('option', { name: 'Reading' })

    fireEvent.change(duration, { target: { value: '65' } })
    fireEvent.change(screen.getByLabelText('Skill'), { target: { value: 'skill-reading' } })
    fireEvent.change(screen.getByLabelText('Topic (optional)'), {
      target: { value: 'IELTS Task 2' },
    })
    fireEvent.change(screen.getByLabelText('Day'), { target: { value: '2026-11-02' } })

    expect(screen.getByText(/1h 5m · Reading · IELTS Task 2/)).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Add to today’s plan' }))

    await waitFor(() => expect(postsTo(api, '/apply')).toHaveLength(1))
    const applyBody = postsTo(api, '/apply')[0]?.body
    expect(applyBody).toMatchObject({
      targetMinutes: 65,
      skillId: 'skill-reading',
      topic: 'IELTS Task 2',
    })

    const start = new Date(String(applyBody?.['startDate']))
    expect([start.getFullYear(), start.getMonth(), start.getDate()]).toEqual([2026, 10, 2])

    await waitFor(() => expect(postsTo(api, '/feedback')).toHaveLength(1))
    expect(postsTo(api, '/feedback')[0]?.body).toMatchObject({ action: 'MODIFIED' })
  })

  it('records a rejection with the reason the learner typed', async () => {
    const api = installApi([makeRecommendation()])

    renderWithClient(<RecommendationPanel limit={3} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Reject: Practise Writing again' }))

    fireEvent.change(await screen.findByLabelText('Reason (optional)'), {
      target: { value: 'Not this month' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Reject suggestion' }))

    await waitFor(() => expect(postsTo(api, '/feedback')).toHaveLength(1))
    expect(postsTo(api, '/feedback')[0]?.body).toEqual({
      action: 'REJECTED',
      reason: 'Not this month',
    })
    expect(postsTo(api, '/apply')).toHaveLength(0)
  })

  it('accepts a rejection without a reason', async () => {
    const api = installApi([makeRecommendation()])

    renderWithClient(<RecommendationPanel limit={3} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Reject: Practise Writing again' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Reject suggestion' }))

    await waitFor(() => expect(postsTo(api, '/feedback')).toHaveLength(1))
    expect(postsTo(api, '/feedback')[0]?.body).toEqual({ action: 'REJECTED' })
  })

  it('moves a postponed suggestion out of the primary view', async () => {
    const api = installApi([makeRecommendation()])

    renderWithClient(<RecommendationPanel limit={3} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Later: Practise Writing again' }))

    await waitFor(() => expect(postsTo(api, '/feedback')).toHaveLength(1))
    expect(postsTo(api, '/feedback')[0]?.body).toEqual({ action: 'POSTPONED' })

    await waitFor(() => expect(screen.queryByText('Practise Writing again')).toBeNull())
    expect(await screen.findByText(/Moved out of your suggestions/)).toBeDefined()
    expect(screen.getByText('No suggestions right now')).toBeDefined()
  })

  it('says where the wording came from when the model service is unavailable', async () => {
    installApi([makeRecommendation()])
    renderWithClient(<RecommendationPanel limit={3} />)

    expect(
      await screen.findByText(/computed from your recorded data by LingoPath’s built-in rules/),
    ).toBeDefined()
  })

  it('keeps the rest of the page intact when the service is down', async () => {
    installFailingApi()
    renderWithClient(<RecommendationPanel limit={3} />)

    expect(await screen.findByText(/Suggestions are unavailable right now/)).toBeDefined()
    expect(screen.getByText(/Everything else on this page is unaffected/)).toBeDefined()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeDefined()
  })
})

describe('suggestion history', () => {
  const entries: RecommendationHistoryEntry[] = [
    {
      id: 'fb-2',
      recommendationId: 'rec-1',
      action: 'ACCEPTED',
      reason: null,
      decidedAt: new Date(2026, 9, 17, 14, 5).toISOString(),
      title: 'Practise Writing again',
      recommendation: 'Add one 45-minute writing session this week.',
      rationale: 'Your last writing session was 19 days ago.',
      type: 'SKILL',
      confidence: 'MEDIUM',
      relatedSkillId: 'skill-writing',
      relatedSkillName: 'Writing',
      status: 'ACCEPTED',
      appliedAt: new Date(2026, 9, 17, 14, 10).toISOString(),
      appliedGoalId: 'goal-1',
    },
    {
      id: 'fb-1',
      recommendationId: 'rec-2',
      action: 'REJECTED',
      reason: 'Not this month',
      decidedAt: new Date(2026, 9, 16, 9, 30).toISOString(),
      title: 'Protect your streak',
      recommendation: 'Study on your next available day.',
      rationale: 'Your streak is four days long.',
      type: 'CONSISTENCY',
      confidence: 'LOW',
      relatedSkillId: null,
      relatedSkillName: null,
      status: 'REJECTED',
      appliedAt: null,
      appliedGoalId: null,
    },
  ]

  it('shows the recommendation, date, action, skill and rationale of every decision', async () => {
    installApi([], entries)
    renderWithClient(<RecommendationHistoryPageClient />)

    expect(await screen.findByText('Practise Writing again')).toBeDefined()
    expect(screen.getByText('Protect your streak')).toBeDefined()
    expect(screen.getByText('Oct 17, 2026, 2:05 PM')).toBeDefined()
    expect(screen.getAllByText('Accepted').length).toBeGreaterThan(0)
    expect(screen.getByText('Added to plan')).toBeDefined()
    expect(screen.getAllByText('Rejected').length).toBeGreaterThan(0)
    expect(screen.getByText('“Not this month”')).toBeDefined()
    expect(screen.getByText('Writing')).toBeDefined()
    expect(screen.getByText('Your last writing session was 19 days ago.')).toBeDefined()
    expect(screen.getByText('2 recorded decisions')).toBeDefined()
  })

  it('filters the record by action', async () => {
    const api = installApi([], entries)
    renderWithClient(<RecommendationHistoryPageClient />)

    await screen.findByText('Practise Writing again')
    fireEvent.click(screen.getByRole('button', { name: 'Rejected' }))

    await waitFor(() =>
      expect(api.calls.some((call) => call.url.includes('action=REJECTED'))).toBe(true),
    )
  })

  it('explains an empty record instead of showing an empty table', async () => {
    installApi([], [])
    renderWithClient(<RecommendationHistoryPageClient />)

    expect(await screen.findByText('No decisions recorded yet')).toBeDefined()
  })
})

describe('safety net', () => {
  it('keeps the page usable when the suggestion panel cannot render', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    function Exploding(): React.ReactElement {
      throw new Error('boom')
    }

    render(
      <RecommendationBoundary>
        <Exploding />
      </RecommendationBoundary>,
    )

    expect(screen.getByText(/Suggestions could not be displayed/)).toBeDefined()

    spy.mockRestore()
  })
})

describe('suggestions page', () => {
  it('asks for a fresh batch only when the learner clicks', async () => {
    const api = installApi([])

    renderWithClient(<RecommendationsPageClient />)

    expect(await screen.findByText('No suggestions yet')).toBeDefined()
    expect(api.calls.some((call) => call.url.endsWith('/generate'))).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Look for suggestions' }))

    await waitFor(() =>
      expect(
        api.calls.some((call) => call.method === 'POST' && call.url.endsWith('/generate')),
      ).toBe(true),
    )
    expect(await screen.findByText('Protect your streak')).toBeDefined()
    expect(await screen.findByText(/Generated 1 suggestion/)).toBeDefined()
  })
})
