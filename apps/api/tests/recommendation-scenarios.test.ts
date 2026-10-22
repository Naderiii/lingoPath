/**
 * The stress-test suite for the recommendation system (Phase 12).
 *
 * Each block below is one product scenario, not one function. A scenario sets up a
 * realistic account, runs the real pipeline (`buildRecommendationContext` →
 * `analyzeContext` → `buildCandidates` → `applyFeedbackRules` → engine), and then
 * asserts on what a learner would actually read.
 *
 * The assertions are deliberately about claims, not about code shape: the engine is
 * allowed to change its wording, but it is not allowed to call practice ability, to
 * invent a score, to promise an outcome, to contradict itself, or to draw a
 * conclusion the evidence cannot carry.
 */

import { describe, expect, it } from 'vitest'
import {
  analyzeContext,
  minConfidence,
  resolveConfidenceCeiling,
  type RecommendationSignal,
} from '../src/modules/recommendations/recommendation.analysis.js'
import {
  applyFeedbackRules,
  buildCandidates,
  proposeLowerDailyTarget,
  DEFAULT_MAX_CANDIDATES,
  type CandidateRecommendation,
} from '../src/modules/recommendations/recommendation.candidates.js'
import {
  buildRecommendationContext,
  type RecommendationContext,
  type RecommendationRawData,
} from '../src/modules/recommendations/recommendation.context.js'
import { generateRecommendations } from '../src/modules/recommendations/recommendation.engine.js'
import {
  createUnavailableLlmAdapter,
  type LlmAdapter,
  type LlmResult,
} from '../src/modules/recommendations/recommendation.llm.js'
import { findReasoningViolation } from '../src/modules/recommendations/recommendation.prompt.js'
import {
  makeContext,
  makeExam,
  makeFeedback,
  makeGoal,
  makeObjective,
  makePlan,
  makeRawData,
  SKILL_IDS,
} from './recommendation-fixtures.js'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Runs the deterministic half of the pipeline and returns the visible batch. */
function recommendationsFor(
  context: RecommendationContext,
  options: { maxCandidates?: number } = {},
): CandidateRecommendation[] {
  const analysis = analyzeContext(context)
  const candidates = buildCandidates(context, analysis.signals, analysis, options)
  return applyFeedbackRules(candidates, context).candidates
}

function proseOf(candidates: readonly CandidateRecommendation[]): string {
  return candidates
    .map((candidate) => `${candidate.title}\n${candidate.recommendation}\n${candidate.rationale}`)
    .join('\n')
}

function signalsOfKind(
  context: RecommendationContext,
  kind: RecommendationSignal['kind'],
): RecommendationSignal[] {
  return analyzeContext(context).signals.filter((signal) => signal.kind === kind)
}

function candidateText(candidate: CandidateRecommendation | undefined): string {
  return `${candidate?.title ?? ''} ${candidate?.recommendation ?? ''} ${candidate?.rationale ?? ''}`
}

function stubAdapter(handler: () => LlmResult): LlmAdapter {
  return {
    provider: 'stub',
    model: 'stub-model',
    configured: true,
    complete: async () => handler(),
  }
}

function jsonAdapter(payload: unknown): LlmAdapter {
  return stubAdapter(() => ({
    ok: true,
    text: JSON.stringify(payload),
    provider: 'stub',
    model: 'stub-model',
  }))
}

/** A raw account with two skills spread evenly and a supplied goal list. */
function rawAccount(overrides: Record<string, unknown> = {}): RecommendationRawData {
  const buckets = Array.from({ length: 10 }, (_, index) => {
    const day = `2026-03-${String(15 - index).padStart(2, '0')}`
    return [
      { day, skillId: SKILL_IDS.writing, minutes: 30, sessions: 1 },
      { day, skillId: SKILL_IDS.reading, minutes: 30, sessions: 1 },
    ]
  }).flat()

  return {
    ...makeRawData({
      skills: [
        { id: SKILL_IDS.writing, name: 'Writing' },
        { id: SKILL_IDS.reading, name: 'Reading' },
      ],
      skillTotals: [
        { skillId: SKILL_IDS.writing, minutes: 300, sessions: 10 },
        { skillId: SKILL_IDS.reading, minutes: 300, sessions: 10 },
      ],
      skillRecency: [
        { skillId: SKILL_IDS.writing, lastStartedAt: new Date('2026-03-15T09:00:00Z') },
        { skillId: SKILL_IDS.reading, lastStartedAt: new Date('2026-03-15T10:00:00Z') },
      ],
      buckets,
      lifetime: {
        minutes: 600,
        sessions: 20,
        activeDays: 10,
        firstStartedAt: new Date('2026-03-06T09:00:00Z'),
        lastStartedAt: new Date('2026-03-15T10:00:00Z'),
      },
      sessionPattern: { medianMinutes: 60, preferredStartHour: 9 },
      streak: { currentStreak: 10, longestStreak: 10 },
      ...overrides,
    }),
  } as unknown as RecommendationRawData
}

function rawGoal(input: {
  id: string
  period: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
  targetMinutes: number
  objectiveId: string | null
  startDate?: string
}) {
  return {
    id: input.id,
    period: input.period,
    startDate: new Date(input.startDate ?? '2026-02-01T00:00:00Z'),
    planId: null,
    objectiveId: input.objectiveId,
    progress: {
      targetMinutes: input.targetMinutes,
      actualMinutes: 0,
      percentage: 0,
      status: 'in_progress',
      skillProgress: [],
    },
  }
}

// ─── Scenario 1 ──────────────────────────────────────────────────────────────

describe('Scenario 1 — vocabulary dominates the study time', () => {
  const dominated = makeContext({
    skillMinutes: { vocabulary: 620, grammar: 180, reading: 110, writing: 90 },
    lastPractised: { vocabulary: 1, grammar: 3, reading: 4, writing: 5 },
  })

  it('identifies the imbalance in minutes instead of calling it balance', () => {
    const analysis = analyzeContext(dominated)
    const imbalance = analysis.signals.find((signal) => signal.kind === 'SKILL_LOW_SHARE')

    expect(imbalance).toBeDefined()
    expect(imbalance?.skillId).toBe(SKILL_IDS.writing)
    expect(imbalance?.severity).toBe('ATTENTION')
    // The old rule reported this account as evenly spread because the smallest
    // share (9%) sat above an absolute 8% floor.
    expect(analysis.signals.some((signal) => signal.kind === 'SKILL_BALANCED')).toBe(false)
  })

  it('quotes both shares and never turns them into a weakness claim', () => {
    const batch = recommendationsFor(dominated)
    const balance = batch.find((candidate) => candidate.type === 'BALANCE')
    const text = candidateText(balance)

    expect(balance?.recommendation).toContain('62%')
    expect(balance?.recommendation).toContain('9%')
    expect(text).not.toMatch(/\bweak|weakest|weaker|poor|bad at|failing\b/i)
    expect(balance?.rationale).toMatch(/does not say the skill you practise less/i)
    expect(findReasoningViolation(text)).toBeNull()
  })

  it('reports total concentration when only one skill was ever practised', () => {
    const single = makeContext({
      skillMinutes: { vocabulary: 900 },
      lastPractised: { vocabulary: 1 },
    })
    const batch = recommendationsFor(single)
    const balance = batch.find((candidate) => candidate.type === 'BALANCE')

    expect(signalsOfKind(single, 'SKILL_CONCENTRATED')).toHaveLength(1)
    expect(balance?.title).toContain('100%')
    expect(balance?.recommendation).toMatch(/nothing else has been logged/i)
    expect(candidateText(balance)).not.toMatch(/spread evenly/i)
    expect(findReasoningViolation(candidateText(balance))).toBeNull()
    // No skill can be named as the one to rebalance towards: nothing was recorded
    // and no goal or plan named one, so naming one would invent a want.
    expect(balance?.relatedSkillId).toBeNull()
  })

  it('still says "evenly" when the split really is even', () => {
    const even = makeContext({
      skillMinutes: { vocabulary: 330, grammar: 300, reading: 200, writing: 170 },
      lastPractised: { vocabulary: 1, grammar: 2, reading: 2, writing: 2 },
    })
    const batch = recommendationsFor(even)

    expect(signalsOfKind(even, 'SKILL_BALANCED')).toHaveLength(1)
    expect(signalsOfKind(even, 'SKILL_LOW_SHARE')).toHaveLength(0)
    expect(batch.find((candidate) => candidate.type === 'BALANCE')?.recommendation).toContain('33%')
  })
})

// ─── Scenario 2 ──────────────────────────────────────────────────────────────

describe('Scenario 2 — the IELTS exam is several months away', () => {
  const longHorizon = makeContext({
    objective: makeObjective({ targetDate: '2026-07-13', daysUntilTargetDate: 120 }),
    exams: [makeExam({ id: 'exam-ielts', daysUntil: 120 })],
    plans: [
      makePlan({
        id: 'plan-1',
        studyProgressPercent: 35,
        timeProgressPercent: 33,
        paceStatus: 'on-track',
        requiredDailyMinutes: 40,
        remainingDays: 78,
      }),
    ],
  })

  it('uses the exam date even beyond the 60-day countdown', () => {
    const analysis = analyzeContext(longHorizon)
    const horizon = analysis.signals.find((signal) => signal.kind === 'EXAM_HORIZON')

    expect(horizon).toBeDefined()
    expect(horizon?.examId).toBe('exam-ielts')
    expect(horizon?.evidenceTag).toContain('days=30+')
    // With a baseline on file this is context, not an alarm.
    expect(horizon?.severity).toBe('INFO')
  })

  it('ties the exam date, the objective and the long-term plan together', () => {
    const horizon = recommendationsFor(longHorizon).find(
      (candidate) => candidate.type === 'EXAM_PREPARATION',
    )
    const text = candidateText(horizon)

    expect(horizon?.title).toContain('120 days')
    expect(horizon?.title).toContain('IELTS')
    expect(horizon?.recommendation).toContain('78 days left')
    expect(horizon?.supportingData.map((point) => point.value)).toContain('2026-07-13')
    expect(horizon?.supportingData.map((point) => point.value)).toContain('120')
    expect(findReasoningViolation(text)).toBeNull()
    expect(text).not.toMatch(/\byou are ready\b|\bwill get\b|\bpredicted score\b/i)
    expect(text).toMatch(/nothing here estimates readiness/i)
  })

  it('adds the recent-practice observation without turning it into readiness', () => {
    const dropping = makeContext({
      objective: makeObjective({ targetDate: '2026-07-13', daysUntilTargetDate: 120 }),
      exams: [makeExam({ id: 'exam-ielts', daysUntil: 120 })],
      plans: [makePlan({ id: 'plan-1', paceStatus: 'on-track', requiredDailyMinutes: 40 })],
      recentMinutes: 40,
      priorMinutes: 400,
    })
    const analysis = analyzeContext(dropping)
    const batch = recommendationsFor(dropping)

    expect(analysis.signals.some((signal) => signal.kind === 'RECENT_PRACTICE_LOW')).toBe(true)
    expect(analysis.signals.some((signal) => signal.kind === 'EXAM_HORIZON')).toBe(true)
    expect(proseOf(batch)).not.toMatch(/you are ready|will get a band|predicted score/i)
  })

  it('stays silent about an exam more than six months away', () => {
    const distant = makeContext({
      objective: makeObjective({ targetDate: '2027-06-01', daysUntilTargetDate: 400 }),
      exams: [makeExam({ id: 'exam-ielts', daysUntil: 400 })],
    })

    expect(signalsOfKind(distant, 'EXAM_HORIZON')).toHaveLength(0)
    expect(signalsOfKind(distant, 'UPCOMING_EXAM')).toHaveLength(0)
  })
})

// ─── Scenario 3 ──────────────────────────────────────────────────────────────

describe('Scenario 3 — no IELTS score exists yet', () => {
  const noScores = makeContext({
    assessment: null,
    objective: makeObjective(),
    exams: [makeExam({ id: 'exam-ielts', daysUntil: 75, latestResult: null })],
  })

  it('invents no level, no weakness and no score', () => {
    const analysis = analyzeContext(noScores)
    const batch = recommendationsFor(noScores)
    const text = proseOf(batch)

    expect(analysis.signals.filter((signal) => signal.kind.startsWith('RECORDED_'))).toHaveLength(0)
    expect(text).not.toMatch(/\b(A1|A2|B1|B2|C1|C2)\b/)
    expect(text).not.toMatch(/\bband \d|\bscore of \d|predicted\b/i)
    expect(text).not.toMatch(/\bweak|weakest|weaker|poor at\b/i)
    for (const candidate of batch) {
      expect(findReasoningViolation(candidateText(candidate))).toBeNull()
    }
  })

  it('asks for the baseline measurement instead of filling the gap', () => {
    const batch = recommendationsFor(noScores)
    const ask = batch[0]

    expect(ask?.type).toBe('EXAM_PREPARATION')
    expect(ask?.title).toContain('record a baseline')
    expect(ask?.recommendation).toMatch(/no assessment or mock result is on file/i)
    expect(ask?.confidence).not.toBe('HIGH')
    // The request is a data request: it has no goal to create and no duration claim.
    expect(ask?.suggestedAction).toBeNull()
  })

  it('says in the data-quality notes which evidence is missing', () => {
    const notes = analyzeContext(noScores).dataQuality.notes.join(' ')

    expect(notes).toMatch(/no cefr assessment is recorded/i)
    expect(notes).toMatch(/no exam result is recorded/i)
    expect(notes).toMatch(/no score is estimated or predicted/i)
  })

  it('keeps the missing-score request when the exam is closer than the horizon', () => {
    const soon = makeContext({
      assessment: null,
      objective: makeObjective(),
      exams: [makeExam({ id: 'exam-ielts', daysUntil: 30, latestResult: null })],
    })
    const kinds = analyzeContext(soon).signals.map((signal) => signal.kind)

    expect(kinds).toContain('UPCOMING_EXAM')
    expect(kinds).toContain('EXAM_WITHOUT_RECENT_RESULT')
    expect(kinds).not.toContain('EXAM_HORIZON')
  })
})

// ─── Scenario 4 ──────────────────────────────────────────────────────────────

describe('Scenario 4 — only three study sessions exist', () => {
  const thin = makeContext({
    sessions: 3,
    activeDays: 2,
    recentMinutes: 90,
    priorMinutes: 0,
    recentActiveDays: 2,
    lastSessionDaysAgo: 1,
    medianSessionMinutes: null,
    assessment: null,
    goals: [makeGoal({ id: 'goal-daily', period: 'DAILY', targetMinutes: 30 })],
    goalCompletion: { dailyTargetMinutes: 30, daysMeetingTarget: 0, trackedDays: 14, rate: 0 },
  })

  it('caps every recommendation at LOW confidence', async () => {
    const analysis = analyzeContext(thin)
    const batch = recommendationsFor(thin)
    const engine = await generateRecommendations(thin, { llm: createUnavailableLlmAdapter() })

    expect(analysis.confidenceCeiling).toBe('LOW')
    expect(batch.length).toBeGreaterThan(0)
    for (const candidate of batch) expect(candidate.confidence).toBe('LOW')
    for (const recommendation of engine.recommendations) {
      expect(recommendation.confidence).toBe('LOW')
      expect(recommendation.confidenceBasis).toMatch(/2 recorded sessions|coarse band/i)
    }
  })

  it('does not conclude that the daily target is too large', () => {
    const analysis = analyzeContext(thin)
    const notes = analysis.dataQuality.notes.join(' ')
    const text = proseOf(recommendationsFor(thin))

    expect(analysis.signals.some((signal) => signal.kind === 'MISSED_GOALS')).toBe(false)
    expect(notes).toMatch(/too few attempts/i)
    expect(text).not.toMatch(/target you can actually hit|try \d+ min/i)
  })

  it('says out loud that the band is limited by the history', () => {
    expect(analyzeContext(thin).dataQuality.notes.join(' ')).toMatch(/only 3 sessions/i)
  })
})

// ─── Scenario 5 ──────────────────────────────────────────────────────────────

describe('Scenario 5 — writing is strong, recent writing practice is low', () => {
  // `overall C1` and `writing C1` come from the same report, which is the normal
  // shape of a recorded result and the case that used to hide the writing signal.
  const strongButQuiet = makeContext({
    skillMinutes: { vocabulary: 200, grammar: 120, reading: 100, writing: 60 },
    lastPractised: { vocabulary: 1, grammar: 1, reading: 1, writing: 12 },
    assessment: {
      levels: { overall: 'C1', writing: 'C1', reading: 'B2', listening: 'B2', speaking: 'B1' },
    },
  })
  strongButQuiet.skills = strongButQuiet.skills.map((skill) =>
    skill.name === 'Writing'
      ? { ...skill, recentMinutes: 15, priorMinutes: 260, recentSessions: 1 }
      : skill,
  )

  it('separates practice frequency from recorded ability in one observation', () => {
    const batch = recommendationsFor(strongButQuiet)
    const writing = batch.find((candidate) => candidate.relatedSkillId === SKILL_IDS.writing)
    const text = candidateText(writing)

    expect(writing?.title).toMatch(/practice dropped/i)
    expect(writing?.recommendation).toContain('15 min')
    expect(writing?.recommendation).toContain('4 h 20 min')
    expect(writing?.recommendation).toContain('C1')
    expect(writing?.recommendation).toMatch(/has not changed/i)
    expect(writing?.rationale).toMatch(/practice volume and recorded ability are separate/i)
    expect(text).not.toMatch(/\bweak|weakest|weaker|poor\b/i)
    expect(findReasoningViolation(text)).toBeNull()
  })

  it('supports the claim with both kinds of evidence, labelled by source', () => {
    const writing = recommendationsFor(strongButQuiet).find(
      (candidate) => candidate.relatedSkillId === SKILL_IDS.writing,
    )
    const sources = new Set(writing?.supportingData.map((point) => point.source))

    expect(sources.has('STUDY_SESSIONS')).toBe(true)
    expect(sources.has('RECORDED_ASSESSMENT')).toBe(true)
  })

  it('recognises the highest recorded dimension when `overall` ties with it', () => {
    const analysis = analyzeContext(strongButQuiet)
    const strength = analysis.signals.find(
      (signal) => signal.kind === 'RECORDED_STRENGTH_UNPRACTISED',
    )

    // Regression: `overall` used to win the top rank and leave writing neither
    // "highest" nor "lower", so the ability side of the story disappeared.
    expect(strength?.skillId).toBe(SKILL_IDS.writing)
    expect(strength?.evidence.some((point) => point.value.includes('C1'))).toBe(true)
  })

  it('treats every dimension tied for the top rank as highest', () => {
    const tied = makeContext({
      lastPractised: {
        vocabulary: 1,
        grammar: 1,
        writing: 10,
        speaking: 12,
        reading: 1,
        listening: 1,
      },
      assessment: {
        levels: { overall: null, writing: 'C1', speaking: 'C1', reading: 'B2', listening: 'B1' },
      },
    })
    const highs = analyzeContext(tied).signals.filter(
      (signal) => signal.kind === 'RECORDED_STRENGTH_UNPRACTISED',
    )

    expect(highs.map((signal) => signal.skillId).sort()).toEqual(
      [SKILL_IDS.speaking, SKILL_IDS.writing].sort(),
    )
  })

  it('does not repeat the same skill as both a drop and a recency gap', () => {
    const writing = recommendationsFor(strongButQuiet).filter(
      (candidate) => candidate.relatedSkillId === SKILL_IDS.writing,
    )

    expect(writing).toHaveLength(1)
  })
})

// ─── Scenario 6 ──────────────────────────────────────────────────────────────

describe('Scenario 6 — listening recommendations are rejected repeatedly', () => {
  const base = makeContext({
    skillMinutes: { vocabulary: 400, grammar: 200, listening: 150, writing: 100 },
    lastPractised: { vocabulary: 1, grammar: 2, listening: 40, writing: 3 },
  })

  function listeningKey(): string {
    const candidate = recommendationsFor(base).find(
      (entry) => entry.relatedSkillId === SKILL_IDS.listening,
    )
    expect(candidate).toBeDefined()
    return candidate!.evidenceKey
  }

  it('stops repeating after two rejections of the same evidence', () => {
    const key = listeningKey()
    const withFeedback: RecommendationContext = {
      ...base,
      feedback: [
        makeFeedback({ type: 'SKILL', action: 'REJECTED', evidenceKey: key, daysAgo: 4 }),
        makeFeedback({ type: 'SKILL', action: 'REJECTED', evidenceKey: key, daysAgo: 2 }),
      ],
    }

    const result = applyFeedbackRules(
      buildCandidates(base, analyzeContext(base).signals, analyzeContext(base)),
      withFeedback,
    )

    expect(result.suppressed.some((entry) => entry.reason === 'REPEATED_REJECTION')).toBe(true)
    expect(
      result.candidates.some((candidate) => candidate.relatedSkillId === SKILL_IDS.listening),
    ).toBe(false)
  })

  it('keeps the rejection after the learner adds an objective', () => {
    // Regression: the match was scoped to the active objective, so setting any
    // objective (a completely unrelated action) forgot every earlier "no".
    const key = listeningKey()
    const withObjective: RecommendationContext = {
      ...base,
      objective: makeObjective(),
      hasAnyObjective: true,
      feedback: [
        makeFeedback({ type: 'SKILL', action: 'REJECTED', evidenceKey: key, daysAgo: 4 }),
        makeFeedback({ type: 'SKILL', action: 'REJECTED', evidenceKey: key, daysAgo: 2 }),
      ],
    }

    const batch = recommendationsFor(withObjective)
    expect(batch.some((candidate) => candidate.relatedSkillId === SKILL_IDS.listening)).toBe(false)
  })

  it('does not treat "not seen" as a rejection', () => {
    // Regression: `IGNORED` is labelled "Not seen" in the UI. Counting it as a
    // rejection let two unseen rows silence an observation for good.
    const key = listeningKey()
    const unseen: RecommendationContext = {
      ...base,
      feedback: [
        makeFeedback({ type: 'SKILL', action: 'IGNORED', evidenceKey: key, daysAgo: 4 }),
        makeFeedback({ type: 'SKILL', action: 'IGNORED', evidenceKey: key, daysAgo: 2 }),
      ],
    }
    const kept = recommendationsFor(unseen)

    expect(kept.some((candidate) => candidate.relatedSkillId === SKILL_IDS.listening)).toBe(true)
  })

  it('honours a postponement only until its window closes', () => {
    const key = listeningKey()
    const postponed = (daysAgo: number): RecommendationContext => ({
      ...base,
      feedback: [makeFeedback({ type: 'SKILL', action: 'POSTPONED', evidenceKey: key, daysAgo })],
    })

    expect(
      recommendationsFor(postponed(2)).some(
        (candidate) => candidate.relatedSkillId === SKILL_IDS.listening,
      ),
    ).toBe(false)
    expect(
      recommendationsFor(postponed(30)).some(
        (candidate) => candidate.relatedSkillId === SKILL_IDS.listening,
      ),
    ).toBe(true)
  })

  it('lets the observation back when the evidence itself moved', () => {
    const key = listeningKey()
    const moved: RecommendationContext = {
      ...base,
      skills: base.skills.map((skill) =>
        skill.id === SKILL_IDS.listening
          ? { ...skill, lastPracticedDaysAgo: 15, recentMinutes: 0 }
          : skill,
      ),
      feedback: [
        makeFeedback({ type: 'SKILL', action: 'REJECTED', evidenceKey: key, daysAgo: 4 }),
        makeFeedback({ type: 'SKILL', action: 'REJECTED', evidenceKey: key, daysAgo: 2 }),
      ],
    }

    expect(
      recommendationsFor(moved).some((candidate) => candidate.relatedSkillId === SKILL_IDS.listening),
    ).toBe(true)
  })
})

// ─── Scenario 7 ──────────────────────────────────────────────────────────────

describe('Scenario 7 — the objective changes from IELTS to TOEFL', () => {
  const goals = [
    rawGoal({ id: 'goal-ielts', period: 'DAILY', targetMinutes: 60, objectiveId: 'obj-ielts' }),
    rawGoal({ id: 'goal-toefl', period: 'DAILY', targetMinutes: 90, objectiveId: 'obj-toefl' }),
  ]

  const toefl = buildRecommendationContext(
    rawAccount({
      objective: {
        id: 'obj-toefl',
        type: 'TOEFL',
        targetScore: 100,
        targetDate: new Date('2026-06-30T00:00:00Z'),
      },
      hasAnyObjective: true,
      goals,
      exams: [
        {
          id: 'exam-ielts',
          type: 'IELTS',
          status: 'PLANNED',
          scheduledAt: new Date('2026-04-24T09:00:00Z'),
          targetDate: null,
          targetScore: 7,
          results: [],
        },
      ],
    }),
  )

  const ielts = buildRecommendationContext(
    rawAccount({
      objective: {
        id: 'obj-ielts',
        type: 'IELTS',
        targetScore: 7,
        targetDate: new Date('2026-06-30T00:00:00Z'),
      },
      hasAnyObjective: true,
      goals,
      exams: [
        {
          id: 'exam-ielts',
          type: 'IELTS',
          status: 'PLANNED',
          scheduledAt: new Date('2026-04-24T09:00:00Z'),
          targetDate: null,
          targetScore: 7,
          results: [],
        },
      ],
    }),
  )

  it('drops goals that belong to the objective the learner moved away from', () => {
    expect(toefl.goals.map((goal) => goal.id)).toEqual(['goal-toefl'])
    expect(toefl.goalCompletion.dailyTargetMinutes).toBe(90)
    expect(ielts.goals.map((goal) => goal.id)).toEqual(['goal-ielts'])
    expect(ielts.goalCompletion.dailyTargetMinutes).toBe(60)
  })

  it('does not report two objectives’ targets as one conflict', () => {
    expect(signalsOfKind(toefl, 'CONFLICTING_GOALS')).toHaveLength(0)
    expect(signalsOfKind(ielts, 'CONFLICTING_GOALS')).toHaveLength(0)
  })

  it('recommends in TOEFL terms and never mentions the retired IELTS exam', () => {
    const analysis = analyzeContext(toefl)
    const text = proseOf(recommendationsFor(toefl))

    expect(analysis.signals.map((signal) => signal.kind)).toContain('EXAM_MISSING_FOR_OBJECTIVE')
    expect(text).toContain('TOEFL')
    expect(text).not.toContain('IELTS')
    expect(signalsOfKind(toefl, 'UPCOMING_EXAM')).toHaveLength(0)
  })

  it('speaks about the new objective’s own daily target', () => {
    const batch = recommendationsFor(toefl)
    const goalAdvice = batch.find((candidate) => candidate.type === 'DURATION')

    expect(goalAdvice?.recommendation).toContain('1 h 30')
    expect(goalAdvice?.relatedGoalId).toBe('goal-toefl')
  })

  it('adapts back when the objective switches again', () => {
    const analysis = analyzeContext(ielts)
    const upcoming = analysis.signals.find((signal) => signal.kind === 'UPCOMING_EXAM')

    expect(upcoming?.examId).toBe('exam-ielts')
    expect(analysis.signals.map((signal) => signal.kind)).not.toContain(
      'EXAM_MISSING_FOR_OBJECTIVE',
    )
    expect(proseOf(recommendationsFor(ielts))).toContain('IELTS')
  })
})

// ─── Scenario 8 ──────────────────────────────────────────────────────────────

describe('Scenario 8 — the model returns invalid JSON', () => {
  const context = makeContext({ assessment: null })
  const baseline = recommendationsFor(context).map((candidate) => candidate.title)

  const malformed: Array<{ name: string; text: string; reason: RegExp }> = [
    { name: 'truncated object', text: '{"recommendations": [{"candidateId": "c1",}', reason: /not valid JSON/i },
    { name: 'prose only', text: 'Study more listening this week.', reason: /no JSON document/i },
    { name: 'empty array', text: '{"recommendations": []}', reason: /schema/i },
    {
      name: 'unknown candidate',
      text: JSON.stringify({
        recommendations: [
          {
            candidateId: 'c9',
            title: 'A title',
            recommendation: 'A recommendation here',
            rationale: 'A rationale here',
            confidence: 'HIGH',
            estimatedDurationMinutes: 30,
          },
        ],
      }),
      reason: /unknown candidate/i,
    },
    {
      name: 'unexpected field',
      text: JSON.stringify({ recommendations: [], extra: true }),
      reason: /schema/i,
    },
    {
      name: 'wrong confidence enum',
      text: JSON.stringify({
        recommendations: [
          {
            candidateId: 'c1',
            title: 'A title',
            recommendation: 'A recommendation here',
            rationale: 'A rationale here',
            confidence: 'VERY_HIGH',
            estimatedDurationMinutes: 30,
          },
        ],
      }),
      reason: /schema/i,
    },
  ]

  for (const entry of malformed) {
    it(`rejects ${entry.name} and keeps the rule-based batch`, async () => {
      const result = await generateRecommendations(context, {
        llm: stubAdapter(() => ({
          ok: true,
          text: entry.text,
          provider: 'stub',
          model: 'stub',
        })),
      })

      expect(result.llm.outputAccepted).toBe(false)
      expect(result.llm.reason).toMatch(entry.reason)
      expect(result.recommendations.every((item) => item.source === 'RULE_BASED')).toBe(true)
      expect(result.recommendations.map((item) => item.title)).toEqual(baseline)
    })
  }

  it('rejects a valid document written by a model that diagnoses a weakness', async () => {
    const result = await generateRecommendations(context, {
      llm: jsonAdapter({
        recommendations: [
          {
            candidateId: 'c1',
            title: 'Work on your weakest skill',
            recommendation: 'Your weakest skill is listening, so practise it.',
            rationale: 'Listening is weaker than your writing.',
            confidence: 'HIGH',
            estimatedDurationMinutes: 30,
          },
        ],
      }),
    })

    expect(result.llm.outputAccepted).toBe(false)
    expect(result.recommendations.every((item) => item.source === 'RULE_BASED')).toBe(true)
  })

  it('keeps the good items when only one item breaks a rule', async () => {
    const withBalance = makeContext({
      skillMinutes: { vocabulary: 620, grammar: 180, reading: 110, writing: 90 },
      lastPractised: { vocabulary: 1, grammar: 3, reading: 4, writing: 5 },
    })
    const candidates = recommendationsFor(withBalance)
    const first = candidates[0]!

    const result = await generateRecommendations(withBalance, {
      llm: jsonAdapter({
        recommendations: [
          {
            candidateId: 'c1',
            title: 'Rebalance your practice time',
            recommendation: first.recommendation,
            rationale: first.rationale,
            confidence: 'MEDIUM',
            estimatedDurationMinutes: 30,
          },
        ],
      }),
    })

    expect(result.llm.outputAccepted).toBe(true)
    expect(result.recommendations).toHaveLength(1)
    expect(result.recommendations[0]?.supportingData).toEqual(first.supportingData)
  })

  it('never throws, whatever the provider sends', async () => {
    const responses: LlmResult[] = [
      { ok: true, text: '', provider: 'stub', model: 'stub' },
      { ok: true, text: 'null', provider: 'stub', model: 'stub' },
      { ok: true, text: '```json\n{"recommendations": "nope"}\n```', provider: 'stub', model: 'stub' },
    ]

    for (const response of responses) {
      const result = await generateRecommendations(context, { llm: stubAdapter(() => response) })
      expect(result.recommendations.length).toBeGreaterThan(0)
      expect(result.llm.outputAccepted).toBe(false)
    }
  })
})

// ─── Scenario 9 ──────────────────────────────────────────────────────────────

describe('Scenario 9 — the language-model provider is unavailable', () => {
  const context = makeContext({ assessment: null })

  it('answers from the rule engine when no provider is configured', async () => {
    const result = await generateRecommendations(context, { llm: createUnavailableLlmAdapter() })

    expect(result.recommendations.length).toBeGreaterThan(0)
    expect(result.recommendations.every((item) => item.source === 'RULE_BASED')).toBe(true)
    expect(result.llm).toMatchObject({ attempted: false, available: false, outputAccepted: false })
    expect(result.llm.reason).toMatch(/built-in rule engine/i)
  })

  it.each([
    ['timeout', { ok: false as const, reason: 'TIMEOUT' as const, detail: 'no answer in 20000 ms' }],
    ['http error', { ok: false as const, reason: 'HTTP_ERROR' as const, detail: 'HTTP 503' }],
    ['transport', { ok: false as const, reason: 'TRANSPORT_ERROR' as const, detail: 'ECONNRESET' }],
    ['empty', { ok: false as const, reason: 'EMPTY_RESPONSE' as const, detail: 'no content' }],
  ])('keeps working after a provider %s', async (_label, failure) => {
    const result = await generateRecommendations(context, { llm: stubAdapter(() => failure) })

    expect(result.recommendations.length).toBeGreaterThan(0)
    expect(result.recommendations.every((item) => item.source === 'RULE_BASED')).toBe(true)
    expect(result.llm).toMatchObject({ attempted: true, available: false, outputAccepted: false })
    expect(result.llm.reason).toBeTruthy()
  })

  it('survives an adapter that throws instead of returning a failure', async () => {
    const broken: LlmAdapter = {
      provider: 'broken',
      model: null,
      configured: true,
      complete: async () => {
        throw new Error('socket hang up')
      },
    }
    const result = await generateRecommendations(context, { llm: broken })

    expect(result.recommendations.length).toBeGreaterThan(0)
    expect(result.llm.reason).toMatch(/could not be reached/i)
  })
})

// ─── Scenario 10 ─────────────────────────────────────────────────────────────

describe('Scenario 10 — the account has no study history at all', () => {
  const empty = makeContext({
    sessions: 0,
    activeDays: 0,
    recentMinutes: 0,
    priorMinutes: 0,
    recentActiveDays: 0,
    skillMinutes: {},
    lastSessionDaysAgo: null,
    medianSessionMinutes: null,
    assessment: null,
    goals: [makeGoal({ id: 'goal-daily', period: 'DAILY', targetMinutes: 60, percentage: 0 })],
    goalCompletion: { dailyTargetMinutes: 60, daysMeetingTarget: 0, trackedDays: 14, rate: 0 },
  })

  it('shows a transparent low-data state instead of a finding', () => {
    const analysis = analyzeContext(empty)
    const batch = recommendationsFor(empty)

    expect(analysis.confidenceCeiling).toBe('LOW')
    expect(analysis.dataQuality).toMatchObject({
      level: 'LOW',
      sessionCount: 0,
      activeDays: 0,
      assessmentRecorded: false,
      examResultRecorded: false,
    })
    expect(batch).toHaveLength(1)
    expect(batch[0]?.title).toBe('Start your study record')
    expect(batch[0]?.confidence).toBe('LOW')
    expect(batch[0]?.recommendation).toContain('first study session')
  })

  it('does not judge the goal that was never attempted', () => {
    const notes = analyzeContext(empty).dataQuality.notes.join(' ')

    expect(signalsOfKind(empty, 'MISSED_GOALS')).toHaveLength(0)
    expect(notes).toMatch(/no study sessions are recorded/i)
    expect(notes).toMatch(/too few attempts/i)
    expect(proseOf(recommendationsFor(empty))).not.toMatch(/daily target|try \d+ min/i)
  })

  it('bounds the judged window by the goal’s own start date', () => {
    const justSet = buildRecommendationContext(
      rawAccount({
        goals: [
          rawGoal({
            id: 'goal-today',
            period: 'DAILY',
            targetMinutes: 90,
            objectiveId: null,
            startDate: '2026-03-15T00:00:00Z',
          }),
        ],
      }),
    )

    // Ten days of history exist, but the target was set today: one judged day,
    // and that day's 60 minutes do not meet a 90-minute target.
    expect(justSet.goalCompletion.trackedDays).toBe(1)
    expect(justSet.goalCompletion.daysMeetingTarget).toBe(0)
    expect(justSet.goalCompletion.rate).toBe(0)
    expect(analyzeContext(justSet).dataQuality.notes.join(' ')).toMatch(/running for 1 day/i)
  })
})

// ─── Scenario 11 ─────────────────────────────────────────────────────────────

describe('Scenario 11 — a plan has 20 days left and 20% of its target done', () => {
  const behind = makeContext({
    plans: [
      makePlan({
        id: 'plan-1',
        targetMinutes: 6000,
        actualMinutes: 1200,
        studyProgressPercent: 20,
        timeProgressPercent: 75,
        remainingDays: 20,
        paceStatus: 'behind',
        requiredDailyMinutes: 240,
      }),
    ],
  })

  it('reports the numbers exactly once and never promises the outcome', () => {
    const batch = recommendationsFor(behind)
    const plan = batch.filter((candidate) => candidate.type === 'PLAN_ADJUSTMENT')
    const text = candidateText(plan[0])

    // Regression: this account used to receive "add 240 minutes per day" and
    // "240 minutes per day is not realistic" in the same batch.
    expect(plan).toHaveLength(1)
    expect(plan[0]?.title).toBe('The remaining pace is not realistic')
    expect(text).toContain('240 minutes a day')
    expect(text).toContain('20 days')
    expect(text).toContain('20%')
    expect(text).toContain('75%')
    expect(text).not.toMatch(/would close|will reach|guarantee|definitely/i)
    expect(plan[0]?.rationale).toMatch(/nothing is rewritten/i)
    expect(findReasoningViolation(text)).toBeNull()
  })

  it('offers the arithmetic path when the required pace is sustainable', () => {
    const realistic = makeContext({
      plans: [
        makePlan({
          id: 'plan-1',
          targetMinutes: 6000,
          actualMinutes: 3600,
          studyProgressPercent: 60,
          timeProgressPercent: 80,
          remainingDays: 20,
          paceStatus: 'behind',
          requiredDailyMinutes: 120,
        }),
      ],
    })
    const analysis = analyzeContext(realistic)
    const batch = recommendationsFor(realistic)
    const plan = batch.find((candidate) => candidate.type === 'PLAN_ADJUSTMENT')

    expect(analysis.signals.some((signal) => signal.kind === 'PLAN_BEHIND')).toBe(true)
    expect(analysis.signals.some((signal) => signal.kind === 'PLAN_UNREALISTIC_PACE')).toBe(false)
    expect(plan?.recommendation).toContain('120 minutes a day')
    expect(plan?.recommendation).toMatch(/moving the plan's end date/i)
    expect(plan?.recommendation).not.toMatch(/would close/i)
  })

  it('stays silent when the plan has already run out of days', () => {
    const ended = makeContext({
      plans: [
        makePlan({
          id: 'plan-1',
          studyProgressPercent: 20,
          timeProgressPercent: 100,
          remainingDays: 0,
          paceStatus: 'behind',
          requiredDailyMinutes: 4800,
        }),
      ],
    })

    expect(recommendationsFor(ended).some((candidate) => candidate.type === 'PLAN_ADJUSTMENT')).toBe(
      false,
    )
  })
})

// ─── Scenario 12 ─────────────────────────────────────────────────────────────

describe('Scenario 12 — the learner is ahead of the long-term target', () => {
  const ahead = makeContext({
    plans: [
      makePlan({
        id: 'plan-1',
        targetMinutes: 6000,
        actualMinutes: 4200,
        studyProgressPercent: 70,
        timeProgressPercent: 40,
        remainingDays: 60,
        paceStatus: 'ahead',
        requiredDailyMinutes: 30,
      }),
    ],
  })

  it('never claims the learner is behind', () => {
    const analysis = analyzeContext(ahead)
    const text = proseOf(recommendationsFor(ahead))

    expect(analysis.signals.filter((signal) => signal.kind.startsWith('PLAN_'))).toHaveLength(0)
    expect(text).not.toMatch(/behind|not realistic|falling short|catch up/i)
  })

  it('does not flag a completed plan as unreachable', () => {
    const completed = makeContext({
      plans: [
        makePlan({
          id: 'plan-1',
          actualMinutes: 6000,
          studyProgressPercent: 100,
          timeProgressPercent: 40,
          remainingDays: 60,
          paceStatus: 'completed',
          requiredDailyMinutes: 0,
        }),
      ],
    })

    expect(signalsOfKind(completed, 'PLAN_BEHIND')).toHaveLength(0)
    expect(signalsOfKind(completed, 'PLAN_UNREALISTIC_PACE')).toHaveLength(0)
  })
})

// ─── Cross-cutting invariants ────────────────────────────────────────────────

describe('cross-cutting guarantees', () => {
  it('never lets a candidate exceed the band its evidence allows', () => {
    const context = makeContext({
      sessions: 30,
      activeDays: 20,
      currentStreak: 12,
      goalCompletion: { dailyTargetMinutes: 60, daysMeetingTarget: 2, trackedDays: 14, rate: 14 },
      goals: [makeGoal({ id: 'goal-daily', period: 'DAILY', targetMinutes: 60 })],
      plans: [makePlan({ id: 'plan-1', requiredDailyMinutes: 300, studyProgressPercent: 5 })],
      exams: [makeExam({ id: 'exam-1', daysUntil: 14 })],
      objective: makeObjective(),
    })
    const analysis = analyzeContext(context)
    const batch = recommendationsFor(context)
    const signalById = new Map(analysis.signals.map((signal) => [signal.id, signal]))

    expect(analysis.confidenceCeiling).toBe('HIGH')
    expect(batch.length).toBeGreaterThan(1)
    for (const candidate of batch) {
      const signal = signalById.get(candidate.signalIds[0] ?? '')
      expect(signal).toBeDefined()
      expect(candidate.confidence).toBe(
        minConfidence(signal!.maxConfidence, analysis.confidenceCeiling),
      )
    }
  })

  it('never returns more candidates than the cap', () => {
    const context = makeContext({
      sessions: 40,
      skillMinutes: { vocabulary: 900, grammar: 100, reading: 60, writing: 40 },
      lastPractised: { vocabulary: 1, grammar: 30, reading: 20, writing: 40 },
      goals: [makeGoal({ id: 'goal-daily', period: 'DAILY', targetMinutes: 90 })],
      goalCompletion: { dailyTargetMinutes: 90, daysMeetingTarget: 2, trackedDays: 14, rate: 14 },
      plans: [makePlan({ id: 'plan-1', requiredDailyMinutes: 300 })],
      exams: [makeExam({ id: 'exam-1', daysUntil: 10 })],
      objective: makeObjective(),
    })

    for (const cap of [1, 2, 4, 10]) {
      expect(recommendationsFor(context, { maxCandidates: cap }).length).toBeLessThanOrEqual(cap)
    }
    expect(recommendationsFor(context)).toHaveLength(DEFAULT_MAX_CANDIDATES)
  })

  it('keeps the built-in wording inside every reasoning rule it enforces on the model', () => {
    const rich = makeContext({
      sessions: 24,
      activeDays: 14,
      recentMinutes: 20,
      priorMinutes: 500,
      recentActiveDays: 8,
      currentStreak: 0,
      lastSessionDaysAgo: 9,
      medianSessionMinutes: 12,
      skillMinutes: { grammar: 520, reading: 90, writing: 30 },
      lastPractised: { grammar: 2, reading: 21, writing: 30 },
      goals: [
        makeGoal({ id: 'goal-daily', period: 'DAILY', targetMinutes: 90 }),
        makeGoal({ id: 'goal-daily-2', period: 'DAILY', targetMinutes: 60 }),
      ],
      goalCompletion: {
        dailyTargetMinutes: 90,
        daysMeetingTarget: 2,
        trackedDays: 14,
        rate: 14,
        averageActiveDayMinutes: 25,
      },
      plans: [makePlan({ id: 'plan-1', requiredDailyMinutes: 270, remainingDays: 20 })],
      exams: [makeExam({ id: 'exam-1', daysUntil: 12 })],
      objective: makeObjective(),
    })
    const batch = recommendationsFor(rich)

    expect(batch.length).toBeGreaterThan(2)
    for (const candidate of batch) {
      const prose = `${candidate.title}\n${candidate.recommendation}\n${candidate.rationale}`
      expect(findReasoningViolation(prose), `${candidate.candidateId}: ${prose}`).toBeNull()
      expect(candidate.title.length).toBeLessThanOrEqual(140)
      expect(candidate.recommendation.length).toBeLessThanOrEqual(600)
      expect(candidate.rationale.length).toBeLessThanOrEqual(900)
    }
  })

  it('does not mention an exam the account does not have', () => {
    const steady = makeContext({
      assessment: null,
      skillMinutes: { writing: 300, reading: 300 },
      lastPractised: { writing: 1, reading: 1 },
      goals: [makeGoal({ id: 'goal-daily', period: 'DAILY', targetMinutes: 45 })],
      goalCompletion: {
        dailyTargetMinutes: 45,
        daysMeetingTarget: 12,
        trackedDays: 14,
        rate: 86,
        averageActiveDayMinutes: 50,
      },
    })
    const text = proseOf(recommendationsFor(steady))

    // The on-track wording used to end "revisit it when the exam gets closer" for
    // accounts with no objective and no exam at all — an invented deadline.
    expect(text).toMatch(/daily target is working/i)
    expect(text).not.toMatch(/\bexam\b/i)
  })

  it('rejects weakest/weaker claims the previous guard let through', () => {
    expect(findReasoningViolation('Your weakest skill is listening.')).not.toBeNull()
    expect(findReasoningViolation('Listening is weaker than your writing.')).not.toBeNull()
    expect(findReasoningViolation('You are below average in reading.')).not.toBeNull()
    expect(findReasoningViolation('Your last listening session was 19 days ago.')).toBeNull()
  })
})

// ─── Target-proposal regression ──────────────────────────────────────────────

describe('the proposed daily target', () => {
  it('follows the minutes actually achieved, not only the hit rate', () => {
    // Fourteen days at 59 minutes against a 60-minute target: 0% of days met it,
    // but the target is one minute away. The old arithmetic proposed 20 minutes.
    expect(proposeLowerDailyTarget(60, 0, 59)).toBe(55)
    expect(proposeLowerDailyTarget(60, 0, 59)).toBeLessThan(60)
  })

  it('still lowers a target the learner is nowhere near', () => {
    expect(proposeLowerDailyTarget(60, 0, 12)).toBe(10)
    expect(proposeLowerDailyTarget(120, 25, 20)).toBeLessThan(120)
  })

  it('never proposes a block below five minutes', () => {
    expect(proposeLowerDailyTarget(10, 0, 0)).toBe(5)
    expect(proposeLowerDailyTarget(10, 0, 20)).toBe(5)
  })

  it('matches the goal it creates to the target it printed', () => {
    const context = makeContext({
      goals: [makeGoal({ id: 'goal-daily', period: 'DAILY', targetMinutes: 30 })],
      goalCompletion: {
        dailyTargetMinutes: 30,
        daysMeetingTarget: 0,
        trackedDays: 14,
        rate: 0,
        averageActiveDayMinutes: 6,
      },
    })
    const advice = recommendationsFor(context).find((candidate) => candidate.type === 'DURATION')
    const printed = /Try (\d+) min/.exec(advice?.recommendation ?? '')

    expect(printed).not.toBeNull()
    expect(advice?.suggestedAction?.targetMinutes).toBe(Number(printed?.[1]))
    expect(advice?.estimatedDurationMinutes).toBe(Number(printed?.[1]))
  })
})

// ─── Confidence ceiling ──────────────────────────────────────────────────────

describe('the confidence ceiling', () => {
  it('requires sessions, active days and recorded evidence for HIGH', () => {
    expect(
      resolveConfidenceCeiling({
        sessionCount: 25,
        activeDays: 12,
        hasAssessment: true,
        hasExamResult: false,
      }).level,
    ).toBe('HIGH')
    expect(
      resolveConfidenceCeiling({
        sessionCount: 25,
        activeDays: 12,
        hasAssessment: false,
        hasExamResult: false,
      }).level,
    ).toBe('MEDIUM')
    expect(
      resolveConfidenceCeiling({
        sessionCount: 3,
        activeDays: 9,
        hasAssessment: true,
        hasExamResult: true,
      }).level,
    ).toBe('LOW')
  })
})
