import { describe, it, expect } from 'vitest'
import type { Recommendation, RecommendationHistoryEntry } from '@lingopath/types'
import {
  actionLabel,
  confidenceExplanation,
  describePlanItem,
  draftChangedFields,
  draftFor,
  formatDecisionDate,
  historyAppliedLabel,
  historyExcerpt,
  isActionable,
  isDateInputValue,
  requestErrorMessage,
  selectPrimaryRecommendations,
  statusLabel,
  toApplyInput,
  usesBuiltInRules,
  type PlanDraft,
} from './recommendations'

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

describe('selectPrimaryRecommendations', () => {
  it('never returns more than the limit', () => {
    const items = Array.from({ length: 6 }, (_, index) =>
      makeRecommendation({ id: `rec-${index}`, title: `Suggestion ${index}` }),
    )

    expect(selectPrimaryRecommendations(items, 3)).toHaveLength(3)
    expect(selectPrimaryRecommendations(items, 1)).toHaveLength(1)
  })

  it('leaves decided and applied rows out of the primary view', () => {
    const items = [
      makeRecommendation({ id: 'rejected', status: 'REJECTED' }),
      makeRecommendation({
        id: 'applied',
        status: 'ACCEPTED',
        appliedAt: '2026-10-16T09:00:00.000Z',
      }),
      makeRecommendation({ id: 'open', status: 'NEW' }),
    ]

    expect(selectPrimaryRecommendations(items, 3).map((item) => item.id)).toEqual(['open'])
  })

  it('puts an accepted-but-unapplied row first, then ranks by evidence', () => {
    const items = [
      makeRecommendation({ id: 'low', confidence: 'LOW' }),
      makeRecommendation({ id: 'high', confidence: 'HIGH' }),
      makeRecommendation({ id: 'medium', confidence: 'MEDIUM' }),
      makeRecommendation({ id: 'accepted', status: 'ACCEPTED' }),
    ]

    expect(selectPrimaryRecommendations(items, 3).map((item) => item.id)).toEqual([
      'accepted',
      'high',
      'medium',
    ])
  })

  it('treats only new and unapplied-accepted rows as actionable', () => {
    expect(isActionable(makeRecommendation())).toBe(true)
    expect(isActionable(makeRecommendation({ status: 'MODIFIED' }))).toBe(true)
    expect(
      isActionable(
        makeRecommendation({ status: 'MODIFIED', appliedAt: '2026-10-16T09:00:00.000Z' }),
      ),
    ).toBe(false)
    expect(isActionable(makeRecommendation({ status: 'POSTPONED' }))).toBe(false)
  })
})

describe('plan draft', () => {
  it('takes duration from the estimate and the skill from the proposal', () => {
    const draft = draftFor(makeRecommendation(), '2026-10-17')

    expect(draft).toEqual({
      durationMinutes: 45,
      skillId: 'skill-writing',
      topic: '',
      date: '2026-10-17',
    })
  })

  it('falls back to thirty minutes and the related skill', () => {
    const draft = draftFor(
      makeRecommendation({
        estimatedDurationMinutes: null,
        suggestedAction: null,
        relatedSkillId: 'skill-reading',
      }),
      '2026-10-17',
    )

    expect(draft.durationMinutes).toBe(30)
    expect(draft.skillId).toBe('skill-reading')
  })

  it('keeps durations inside what a plan item can be', () => {
    expect(
      draftFor(makeRecommendation({ estimatedDurationMinutes: 2000 }), '2026-10-17')
        .durationMinutes,
    ).toBe(480)
    expect(
      draftFor(makeRecommendation({ estimatedDurationMinutes: 1 }), '2026-10-17').durationMinutes,
    ).toBe(5)
  })

  it('reports only the fields the learner actually changed', () => {
    const base: PlanDraft = {
      durationMinutes: 45,
      skillId: 'skill-writing',
      topic: '',
      date: '2026-10-17',
    }

    expect(draftChangedFields({ ...base }, base)).toEqual([])
    expect(draftChangedFields({ ...base, durationMinutes: 60 }, base)).toEqual(['duration'])
    expect(draftChangedFields({ ...base, skillId: 'skill-reading' }, base)).toEqual(['skill'])
    expect(draftChangedFields({ ...base, topic: 'Task 2' }, base)).toEqual(['topic'])
    expect(draftChangedFields({ ...base, date: '2026-10-18' }, base)).toEqual(['date'])
    expect(
      draftChangedFields(
        { durationMinutes: 60, skillId: 'skill-reading', topic: 'Task 2', date: '2026-10-18' },
        base,
      ),
    ).toEqual(['duration', 'skill', 'topic', 'date'])
  })
})

describe('confirmed payload', () => {
  it('always confirms, and maps the picked day to local midnight and local end-of-day', () => {
    const input = toApplyInput({
      durationMinutes: 45,
      skillId: 'skill-writing',
      topic: '  IELTS Task 2  ',
      date: '2026-10-17',
    })

    expect(input.confirm).toBe(true)
    expect(input.period).toBe('DAILY')
    expect(input.targetMinutes).toBe(45)
    expect(input.skillId).toBe('skill-writing')
    expect(input.topic).toBe('IELTS Task 2')

    const start = new Date(input.startDate as string)
    expect([start.getFullYear(), start.getMonth(), start.getDate()]).toEqual([2026, 9, 17])
    expect([start.getHours(), start.getMinutes(), start.getSeconds()]).toEqual([0, 0, 0])

    const end = new Date(input.endDate as string)
    expect([end.getFullYear(), end.getMonth(), end.getDate()]).toEqual([2026, 9, 17])
    expect([end.getHours(), end.getMinutes()]).toEqual([23, 59])
  })

  it('sends no topic when the field is blank', () => {
    const input = toApplyInput({
      durationMinutes: 30,
      skillId: null,
      topic: '   ',
      date: '2026-10-17',
    })

    expect(input.topic).toBeNull()
    expect(input.skillId).toBeNull()
  })

  it('rejects impossible calendar days', () => {
    expect(isDateInputValue('2026-02-28')).toBe(true)
    expect(isDateInputValue('2024-02-29')).toBe(true)
    expect(isDateInputValue('2026-02-31')).toBe(false)
    expect(isDateInputValue('17-10-2026')).toBe(false)
  })

  it('describes the item in one line', () => {
    const label = describePlanItem(
      { durationMinutes: 45, skillId: 'skill-writing', topic: 'IELTS Task 2', date: '2026-10-17' },
      'Writing',
    )

    expect(label).toBe('45m · Writing · IELTS Task 2 · Sat, Oct 17, 2026')
  })
})

describe('labels', () => {
  it('drops the band name that the chip already shows', () => {
    expect(
      confidenceExplanation('HIGH: your recorded study activity covers enough sessions.'),
    ).toBe('your recorded study activity covers enough sessions.')
    expect(confidenceExplanation('A coarse band, not a probability.')).toBe(
      'A coarse band, not a probability.',
    )
  })

  it('distinguishes accepted from actually added', () => {
    expect(statusLabel('ACCEPTED', null)).toBe('Accepted — not added')
    expect(statusLabel('ACCEPTED', '2026-10-17T09:00:00.000Z')).toBe('Added to plan')
    expect(statusLabel('MODIFIED', null)).toBe('Adjusted — not added')
    expect(statusLabel('POSTPONED', null)).toBe('Moved later')
    expect(actionLabel('REJECTED')).toBe('Rejected')
  })

  it('formats a decision in the learner’s local time', () => {
    const local = new Date(2026, 9, 17, 14, 5)
    expect(formatDecisionDate(local.toISOString())).toBe('Oct 17, 2026, 2:05 PM')
    expect(formatDecisionDate(new Date(2026, 0, 2, 0, 30).toISOString())).toBe(
      'Jan 2, 2026, 12:30 AM',
    )
    expect(formatDecisionDate('not a date')).toBe('—')
  })

  it('shortens long text without cutting mid-word where possible', () => {
    expect(historyExcerpt('short', 20)).toBe('short')
    expect(historyExcerpt('a'.repeat(30), 10)).toBe('aaaaaaaaa…')
  })

  it('prefers the API’s own explanation over a transport code', () => {
    expect(
      requestErrorMessage(new Error('The active objective changed.'), 'Nothing was changed.'),
    ).toBe('The active objective changed.')
    expect(requestErrorMessage(new Error('HTTP 502'), 'Nothing was changed.')).toBe(
      'Nothing was changed.',
    )
    expect(requestErrorMessage(undefined, 'Nothing was changed.')).toBe('Nothing was changed.')
  })
})

describe('history labels', () => {
  const entry: RecommendationHistoryEntry = {
    id: 'fb-1',
    recommendationId: 'rec-1',
    action: 'ACCEPTED',
    reason: null,
    decidedAt: '2026-10-17T09:00:00.000Z',
    title: 'Practise Writing again',
    recommendation: 'Add one 45-minute session.',
    rationale: 'Your last writing session was 19 days ago.',
    type: 'SKILL',
    confidence: 'MEDIUM',
    relatedSkillId: null,
    relatedSkillName: null,
    status: 'ACCEPTED',
    appliedAt: '2026-10-17T09:05:00.000Z',
    appliedGoalId: 'goal-1',
  }

  it('marks the decision that added something, not every decision about it', () => {
    expect(historyAppliedLabel(entry)).toBe('Added to plan')
    expect(historyAppliedLabel({ ...entry, action: 'REJECTED' })).toBeNull()
    expect(historyAppliedLabel({ ...entry, appliedAt: null })).toBeNull()
  })
})

describe('source note', () => {
  it('is only shown when every suggestion came from the built-in rules', () => {
    expect(usesBuiltInRules([])).toBe(false)
    expect(usesBuiltInRules([makeRecommendation(), makeRecommendation({ id: 'b' })])).toBe(true)
    expect(
      usesBuiltInRules([makeRecommendation(), makeRecommendation({ id: 'b', source: 'LLM' })]),
    ).toBe(false)
  })
})
