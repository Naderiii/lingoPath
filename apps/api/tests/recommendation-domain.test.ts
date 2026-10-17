import { describe, it, expect } from 'vitest'
import {
  analyzeContext,
  resolveConfidenceCeiling,
  minConfidence,
} from '../src/modules/recommendations/recommendation.analysis.js'
import {
  applyFeedbackRules,
  buildCandidates,
  proposeLowerDailyTarget,
} from '../src/modules/recommendations/recommendation.candidates.js'
import {
  buildRecommendationContext,
  type RecommendationRawData,
} from '../src/modules/recommendations/recommendation.context.js'
import {
  findReasoningViolation,
  toLlmContextPayload,
} from '../src/modules/recommendations/recommendation.prompt.js'
import {
  makeContext,
  makeExam,
  makeFeedback,
  makeGoal,
  makeObjective,
  makeRawData,
} from './recommendation-fixtures.js'

// ─── Zero and thin history ───────────────────────────────────────────────────

describe('zero study history', () => {
  const context = makeContext({
    sessions: 0,
    activeDays: 0,
    recentMinutes: 0,
    priorMinutes: 0,
    skillMinutes: {},
    lastSessionDaysAgo: null,
    medianSessionMinutes: null,
    assessment: null,
  })

  it('speaks about data collection, not about the learner', () => {
    const analysis = analyzeContext(context)
    const signal = analysis.signals.find((entry) => entry.kind === 'ZERO_STUDY_HISTORY')

    expect(signal).toBeDefined()
    expect(signal?.candidateEligible).toBe(true)
    expect(analysis.confidenceCeiling).toBe('LOW')
    expect(analysis.dataQuality.level).toBe('LOW')

    const candidates = buildCandidates(context, analysis.signals, analysis)
    expect(candidates).toHaveLength(1)
    expect(candidates[0]?.type).toBe('CONSISTENCY')
    expect(candidates[0]?.confidence).toBe('LOW')
    expect(candidates[0]?.recommendation).toContain('first study session')
    // No skill can be named when no skill has any recorded time.
    expect(candidates[0]?.relatedSkillId).toBeNull()
  })

  it('does not invent a weakness with no data at all', () => {
    const analysis = analyzeContext(context)
    const candidates = buildCandidates(context, analysis.signals, analysis)
    const prose = candidates
      .map((candidate) => `${candidate.title} ${candidate.rationale}`)
      .join(' ')

    expect(prose).not.toMatch(/\bweak\b/i)
    expect(prose).not.toMatch(/\bpoor at\b/i)
    expect(findReasoningViolation(prose)).toBeNull()
  })
})

describe('only three sessions', () => {
  const context = makeContext({
    sessions: 3,
    activeDays: 2,
    recentMinutes: 90,
    priorMinutes: 0,
    lastSessionDaysAgo: 2,
    medianSessionMinutes: null,
    assessment: null,
  })

  it('caps every recommendation at LOW confidence', () => {
    const analysis = analyzeContext(context)

    expect(analysis.confidenceCeiling).toBe('LOW')
    expect(analysis.signals.some((signal) => signal.kind === 'INSUFFICIENT_HISTORY')).toBe(true)

    const candidates = buildCandidates(context, analysis.signals, analysis)
    expect(candidates.length).toBeGreaterThan(0)
    for (const candidate of candidates) {
      expect(candidate.confidence).toBe('LOW')
    }
  })

  it('says out loud that the band is limited by the history', () => {
    const analysis = analyzeContext(context)
    expect(analysis.dataQuality.notes.join(' ')).toMatch(/only 3 sessions/i)
  })
})

describe('insufficient data', () => {
  it('reports the gaps instead of filling them', () => {
    const context = makeContext({
      sessions: 1,
      activeDays: 1,
      recentMinutes: 30,
      priorMinutes: 0,
      lastSessionDaysAgo: 0,
      medianSessionMinutes: 30,
      assessment: null,
      skillMinutes: { writing: 30 },
    })

    const analysis = analyzeContext(context)
    const notes = analysis.dataQuality.notes.join(' ')

    expect(analysis.confidenceCeiling).toBe('LOW')
    expect(notes).toMatch(/no cefr assessment/i)
    expect(notes).toMatch(/no exam result/i)
    expect(notes).toMatch(/no daily goal/i)
    // The assessment-dependent signals must be absent, not empty-but-present.
    const abilitySignals = analysis.signals.filter((signal) => signal.kind.startsWith('RECORDED_'))
    expect(abilitySignals).toHaveLength(0)
  })
})

// ─── Balance ─────────────────────────────────────────────────────────────────

describe('unbalanced skills', () => {
  const context = makeContext({
    skillMinutes: { grammar: 500, reading: 100, writing: 40 },
    lastPractised: { grammar: 1, reading: 1, writing: 1 },
  })

  it('describes the imbalance in minutes rather than grading a skill', () => {
    const analysis = analyzeContext(context)
    const signal = analysis.signals.find((entry) => entry.kind === 'SKILL_LOW_SHARE')

    expect(signal).toBeDefined()
    expect(signal?.skillId).toBeDefined()

    const candidates = buildCandidates(context, analysis.signals, analysis)
    const balance = candidates.find((candidate) => candidate.type === 'BALANCE')

    expect(balance).toBeDefined()
    expect(balance?.title).toContain('Rebalance towards')
    expect(balance?.recommendation).toMatch(/%/)
    expect(balance?.rationale).toMatch(/recorded minutes/i)
    expect(balance?.rationale).not.toMatch(/weak|worse than/i)
  })
})

describe('even skill distribution', () => {
  it('acknowledges it instead of manufacturing a problem', () => {
    const analysis = analyzeContext(makeContext())
    const candidates = buildCandidates(makeContext(), analysis.signals, analysis)

    expect(analysis.signals.some((signal) => signal.kind === 'SKILL_BALANCED')).toBe(true)
    expect(candidates).toHaveLength(1)
    expect(candidates[0]?.type).toBe('BALANCE')
    expect(candidates[0]?.severity).toBe('POSITIVE')
  })
})

// ─── Goals ───────────────────────────────────────────────────────────────────

describe('missed goals', () => {
  const context = makeContext({
    goals: [makeGoal({ id: 'goal-daily', period: 'DAILY', targetMinutes: 60, percentage: 29 })],
    goalCompletion: {
      dailyTargetMinutes: 60,
      daysMeetingTarget: 4,
      trackedDays: 14,
      rate: 29,
    },
  })

  it('proposes a smaller target derived from the learner own hit rate', () => {
    const analysis = analyzeContext(context)
    const candidates = buildCandidates(context, analysis.signals, analysis)
    const duration = candidates.find((candidate) => candidate.type === 'DURATION')

    expect(duration).toBeDefined()
    expect(duration?.recommendation).toContain('4 of the last 14')
    expect(duration?.estimatedDurationMinutes).toBe(15)
    expect(duration?.suggestedAction).toMatchObject({ period: 'DAILY', targetMinutes: 15 })
    expect(duration?.relatedGoalId).toBe('goal-daily')
  })

  it('never proposes a target below a five-minute block', () => {
    expect(proposeLowerDailyTarget(10, 10)).toBeGreaterThanOrEqual(5)
    expect(proposeLowerDailyTarget(60, 29)).toBeLessThan(60)
  })
})

describe('conflicting goals', () => {
  const context = makeContext({
    goals: [
      makeGoal({ id: 'goal-a', period: 'DAILY', targetMinutes: 30 }),
      makeGoal({ id: 'goal-b', period: 'DAILY', targetMinutes: 90 }),
    ],
  })

  it('reports the conflict without choosing a winner', () => {
    const analysis = analyzeContext(context)
    const signal = analysis.signals.find((entry) => entry.kind === 'CONFLICTING_GOALS')

    expect(signal).toBeDefined()

    const candidates = buildCandidates(context, analysis.signals, analysis)
    const conflict = candidates.find((candidate) => candidate.title.includes('targets are active'))

    expect(conflict).toBeDefined()
    expect(conflict?.recommendation).toContain('30 min')
    expect(conflict?.recommendation).toContain('1 h 30 min')
    expect(conflict?.suggestedAction).toBeNull()
    expect(conflict?.rationale).toMatch(/your decision/i)
  })
})

// ─── Consistency ─────────────────────────────────────────────────────────────

describe('strong consistency', () => {
  const context = makeContext({ currentStreak: 12, recentMinutes: 240 })
  context.activity.recent.activeDays = 12

  it('protects the streak rather than raising the bar', () => {
    const analysis = analyzeContext(context)
    const candidates = buildCandidates(context, analysis.signals, analysis)

    expect(analysis.signals.some((signal) => signal.kind === 'STRONG_CONSISTENCY')).toBe(true)
    const kept = candidates.find((candidate) => candidate.title === 'Keep the streak intact')
    expect(kept).toBeDefined()
    expect(kept?.severity).toBe('POSITIVE')
    expect(kept?.suggestedAction).toBeNull()
  })
})

describe('a recent drop in study time', () => {
  it('compares two equal windows and calls it practice volume', () => {
    const context = makeContext({ recentMinutes: 60, priorMinutes: 300 })
    const analysis = analyzeContext(context)
    const signal = analysis.signals.find((entry) => entry.kind === 'RECENT_PRACTICE_LOW')

    expect(signal).toBeDefined()
    expect(signal?.evidence.some((point) => point.source === 'STUDY_SESSIONS')).toBe(true)
    expect(signal?.evidence.every((point) => point.source !== 'RECORDED_ASSESSMENT')).toBe(true)
  })
})

// ─── Exams ───────────────────────────────────────────────────────────────────

describe('upcoming exam', () => {
  const context = makeContext({
    objective: makeObjective(),
    exams: [makeExam({ id: 'exam-1', daysUntil: 21 })],
  })

  it('leads with the countdown and the missing result', () => {
    const analysis = analyzeContext(context)
    const kinds = analysis.signals.map((signal) => signal.kind)

    expect(kinds).toContain('UPCOMING_EXAM')
    expect(kinds).toContain('EXAM_WITHOUT_RECENT_RESULT')

    const candidates = buildCandidates(context, analysis.signals, analysis)
    expect(candidates[0]?.type).toBe('EXAM_PREPARATION')
    expect(candidates[0]?.title).toContain('21 days until your IELTS')
    expect(candidates.some((candidate) => candidate.title.includes('Record a mock result'))).toBe(
      true,
    )
  })

  it('states the day count as calendar time, not readiness', () => {
    const analysis = analyzeContext(context)
    const candidates = buildCandidates(context, analysis.signals, analysis)
    const exam = candidates[0]

    expect(exam?.rationale).toMatch(/not how ready you are/i)
    expect(findReasoningViolation(`${exam?.title} ${exam?.rationale}`)).toBeNull()
  })
})

// ─── Recorded ability vs practice ────────────────────────────────────────────

describe('no assessment data', () => {
  const context = makeContext({ assessment: null })

  it('records the gap and never grades ability', () => {
    const analysis = analyzeContext(context)
    const signal = analysis.signals.find((entry) => entry.kind === 'NO_ASSESSMENT_DATA')

    expect(signal).toBeDefined()
    expect(signal?.candidateEligible).toBe(false)

    const candidates = buildCandidates(context, analysis.signals, analysis)
    for (const candidate of candidates) {
      expect(findReasoningViolation(`${candidate.title} ${candidate.recommendation}`)).toBeNull()
      expect(candidate.rationale).not.toMatch(/your (writing|reading|listening|speaking) is/i)
    }
  })

  it('tells the model that no level exists', () => {
    const analysis = analyzeContext(context)
    const payload = toLlmContextPayload(context, analysis)

    expect(payload.recordedAssessment.recorded).toBe(false)
    expect(payload.recordedAssessment.levels).toEqual({
      overall: null,
      listening: null,
      reading: null,
      writing: null,
      speaking: null,
    })
  })
})

describe('a strong recorded level with low recent practice', () => {
  const context = makeContext({
    lastPractised: {
      vocabulary: 2,
      grammar: 2,
      listening: 2,
      reading: 2,
      writing: 19,
      speaking: 2,
    },
  })

  it('says exactly that, in those words, without the word weak', () => {
    const analysis = analyzeContext(context)
    const signal = analysis.signals.find((entry) => entry.kind === 'RECORDED_STRENGTH_UNPRACTISED')

    expect(signal).toBeDefined()
    expect(signal?.skillId).toBeDefined()

    const candidates = buildCandidates(context, analysis.signals, analysis)
    const strength = candidates.find((candidate) => candidate.signalIds.includes(signal?.id ?? ''))

    expect(strength).toBeDefined()
    expect(strength?.recommendation).toMatch(/highest you have recorded/i)
    expect(strength?.recommendation).toMatch(/19 days ago/i)
    expect(`${strength?.title} ${strength?.recommendation} ${strength?.rationale}`).not.toMatch(
      /\bweak\b/i,
    )
    expect(findReasoningViolation(`${strength?.title} ${strength?.rationale}`)).toBeNull()

    // The evidence names both facts and where each came from.
    const sources = new Set(strength?.supportingData.map((point) => point.source))
    expect(sources.has('RECORDED_ASSESSMENT')).toBe(true)
    expect(sources.has('STUDY_SESSIONS')).toBe(true)
  })
})

// ─── Feedback memory ─────────────────────────────────────────────────────────

describe('repeated rejection', () => {
  const context = makeContext()
  const analysis = analyzeContext(context)
  const candidates = buildCandidates(context, analysis.signals, analysis)
  const target = candidates[0]

  it('stops repeating a recommendation whose evidence has not moved', () => {
    expect(target).toBeDefined()
    const withFeedback = {
      ...context,
      feedback: [
        makeFeedback({
          type: target!.type,
          action: 'REJECTED',
          evidenceKey: target!.evidenceKey,
          objectiveId: null,
        }),
        makeFeedback({
          type: target!.type,
          action: 'REJECTED',
          evidenceKey: target!.evidenceKey,
          objectiveId: null,
          daysAgo: 2,
        }),
      ],
    }

    const result = applyFeedbackRules(candidates, withFeedback)

    expect(result.candidates).toHaveLength(0)
    expect(result.suppressed[0]?.reason).toBe('REPEATED_REJECTION')
  })

  it('lowers the band after a single rejection instead of hiding the observation', () => {
    const withFeedback = {
      ...context,
      feedback: [
        makeFeedback({
          type: target!.type,
          action: 'REJECTED',
          evidenceKey: target!.evidenceKey,
          objectiveId: null,
        }),
      ],
    }

    const result = applyFeedbackRules(candidates, withFeedback)

    expect(result.candidates).toHaveLength(1)
    expect(result.confidenceAdjusted).toBe(1)
    expect(result.candidates[0]?.confidence).toBe('LOW')
  })

  it('lets it back when the evidence has changed', () => {
    const withFeedback = {
      ...context,
      feedback: [
        makeFeedback({
          type: target!.type,
          action: 'REJECTED',
          evidenceKey: 'BALANCE|-|SKILL_BALANCED|top=90|skills=2',
          objectiveId: null,
        }),
        makeFeedback({
          type: target!.type,
          action: 'REJECTED',
          evidenceKey: 'BALANCE|-|SKILL_BALANCED|top=90|skills=2',
          objectiveId: null,
        }),
      ],
    }

    const result = applyFeedbackRules(candidates, withFeedback)

    expect(result.candidates).toHaveLength(1)
    expect(result.suppressed).toHaveLength(0)
  })

  it('holds a postponed recommendation until the window closes', () => {
    const withFeedback = {
      ...context,
      feedback: [
        makeFeedback({
          type: target!.type,
          action: 'POSTPONED',
          evidenceKey: target!.evidenceKey,
          objectiveId: null,
          daysAgo: 2,
        }),
      ],
    }

    const result = applyFeedbackRules(candidates, withFeedback)
    expect(result.suppressed[0]?.reason).toBe('POSTPONED')

    const old = applyFeedbackRules(candidates, {
      ...context,
      feedback: [
        makeFeedback({
          type: target!.type,
          action: 'POSTPONED',
          evidenceKey: target!.evidenceKey,
          objectiveId: null,
          daysAgo: 30,
        }),
      ],
    })
    expect(old.candidates).toHaveLength(1)
  })
})

// ─── Objective change ────────────────────────────────────────────────────────

describe('changed objective', () => {
  const ielts = makeContext({
    objective: makeObjective({ type: 'IELTS' }),
    exams: [makeExam({ id: 'exam-ielts', type: 'IELTS', daysUntil: 30 })],
  })
  const toefl = makeContext({
    objective: makeObjective({
      id: 'objective-toefl',
      type: 'TOEFL',
      targetScore: 100,
    }),
    exams: [makeExam({ id: 'exam-ielts', type: 'IELTS', daysUntil: 30 })],
  })

  it('adapts the recommendation to the new objective', () => {
    const analysis = analyzeContext(toefl)
    const missing = analysis.signals.find((entry) => entry.kind === 'EXAM_MISSING_FOR_OBJECTIVE')

    expect(missing).toBeDefined()

    const candidates = buildCandidates(toefl, analysis.signals, analysis)
    const prose = candidates
      .map((candidate) => `${candidate.title} ${candidate.recommendation}`)
      .join(' ')

    expect(prose).toContain('TOEFL')
    expect(prose).not.toContain('IELTS')
  })

  it('does not raise the missing-exam observation for the objective that has one', () => {
    const analysis = analyzeContext(ielts)
    expect(analysis.signals.some((signal) => signal.kind === 'EXAM_MISSING_FOR_OBJECTIVE')).toBe(
      false,
    )
  })
})

// ─── Confidence ──────────────────────────────────────────────────────────────

describe('confidence ceiling', () => {
  it('needs sessions, active days and recorded evidence for a high band', () => {
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

  it('never lets a signal exceed the ceiling', () => {
    expect(minConfidence('HIGH', 'LOW')).toBe('LOW')
    expect(minConfidence('LOW', 'HIGH')).toBe('LOW')
    expect(minConfidence('MEDIUM', 'HIGH')).toBe('MEDIUM')

    const thin = makeContext({ sessions: 3, activeDays: 2, assessment: null })
    const analysis = analyzeContext(thin)
    const candidates = buildCandidates(thin, analysis.signals, analysis)
    for (const candidate of candidates) {
      expect(candidate.confidence).toBe('LOW')
    }
  })
})

// ─── Plans ───────────────────────────────────────────────────────────────────

describe('a plan running behind', () => {
  const context = makeContext({
    plans: [
      {
        id: 'plan-1',
        targetMinutes: 6000,
        actualMinutes: 900,
        studyProgressPercent: 15,
        timeProgressPercent: 65,
        remainingDays: 22,
        paceStatus: 'behind',
        requiredDailyMinutes: 232,
        currentMilestone: null,
      },
    ],
  })

  it('offers two options and applies neither', () => {
    const analysis = analyzeContext(context)
    const candidates = buildCandidates(context, analysis.signals, analysis)
    const adjustment = candidates.find((candidate) => candidate.type === 'PLAN_ADJUSTMENT')

    expect(analysis.signals.some((signal) => signal.kind === 'PLAN_BEHIND')).toBe(true)
    expect(analysis.signals.some((signal) => signal.kind === 'PLAN_UNREALISTIC_PACE')).toBe(true)

    expect(adjustment).toBeDefined()
    expect(adjustment?.relatedPlanId).toBe('plan-1')
    expect(adjustment?.recommendation).toMatch(/minutes per day/i)
    expect(adjustment?.rationale).toMatch(/neither is applied|cannot change a plan/i)
    // A plan reshuffle is advice only: there is no safe automatic write for it.
    expect(adjustment?.suggestedAction).toBeNull()
  })
})

// ─── Built-in wording guard ──────────────────────────────────────────────────

describe('built-in wording', () => {
  it('passes the same reasoning guard the model output must pass', () => {
    // A context that lights up every recommendation type at once.
    const context = makeContext({
      sessions: 24,
      activeDays: 14,
      recentMinutes: 40,
      priorMinutes: 400,
      currentStreak: 0,
      lastSessionDaysAgo: 9,
      medianSessionMinutes: 12,
      skillMinutes: { grammar: 520, reading: 90, writing: 30 },
      lastPractised: { grammar: 2, reading: 21, writing: 30 },
      goals: [
        makeGoal({ id: 'goal-daily', period: 'DAILY', targetMinutes: 60 }),
        makeGoal({ id: 'goal-daily-2', period: 'DAILY', targetMinutes: 90 }),
      ],
      goalCompletion: {
        dailyTargetMinutes: 60,
        daysMeetingTarget: 2,
        trackedDays: 14,
        rate: 14,
      },
      plans: [
        {
          id: 'plan-1',
          targetMinutes: 6000,
          actualMinutes: 600,
          studyProgressPercent: 10,
          timeProgressPercent: 70,
          remainingDays: 20,
          paceStatus: 'behind',
          requiredDailyMinutes: 270,
          currentMilestone: {
            id: 'm1',
            targetMinutes: 2000,
            actualMinutes: 200,
            progressPercent: 10,
            remainingDays: 10,
            skillId: null,
          },
        },
      ],
      exams: [makeExam({ id: 'exam-1', daysUntil: 12 })],
      objective: makeObjective(),
    })

    const analysis = analyzeContext(context)
    const candidates = buildCandidates(context, analysis.signals, analysis)

    expect(candidates.length).toBeGreaterThan(2)
    for (const candidate of candidates) {
      const prose = `${candidate.title}\n${candidate.recommendation}\n${candidate.rationale}`
      expect(findReasoningViolation(prose), `${candidate.candidateId}: ${prose}`).toBeNull()
      expect(candidate.title.length).toBeLessThanOrEqual(140)
      expect(candidate.recommendation.length).toBeLessThanOrEqual(600)
      expect(candidate.rationale.length).toBeLessThanOrEqual(900)
    }
  })
})

// ─── Context builder ─────────────────────────────────────────────────────────

describe('buildRecommendationContext', () => {
  it('splits the last 28 days into two equal windows and counts active days', () => {
    const raw = makeRawData({
      timezone: 'UTC',
      lifetime: {
        minutes: 300,
        sessions: 5,
        activeDays: 4,
        firstStartedAt: null,
        lastStartedAt: null,
      },
      skills: [{ id: 's1', name: 'Writing' }],
      skillTotals: [{ skillId: 's1', minutes: 300, sessions: 5 }],
      buckets: [
        { day: '2026-03-14', skillId: 's1', minutes: 60, sessions: 2 },
        { day: '2026-03-10', skillId: 's1', minutes: 40, sessions: 1 },
        // 24 days before "today": inside the prior window, outside the recent one.
        { day: '2026-02-19', skillId: 's1', minutes: 200, sessions: 2 },
      ],
    }) as unknown as RecommendationRawData

    const context = buildRecommendationContext(raw)

    expect(context.today).toBe('2026-03-15')
    expect(context.activity.recent.minutes).toBe(100)
    expect(context.activity.recent.activeDays).toBe(2)
    expect(context.activity.prior.minutes).toBe(200)
    expect(context.skills[0]?.share).toBe(1)
    // Recent + prior only: the bucket outside both windows is not double counted.
    expect(context.activity.recent.minutes + context.activity.prior.minutes).toBe(300)
  })

  it('counts the days that met the daily target from the same buckets', () => {
    const raw = makeRawData({
      goals: [
        {
          id: 'g1',
          period: 'DAILY',
          planId: null,
          objectiveId: null,
          progress: {
            targetMinutes: 30,
            actualMinutes: 0,
            percentage: 0,
            status: 'in_progress',
            skillProgress: [],
          },
        },
      ],
      skills: [{ id: 's1', name: 'Writing' }],
      buckets: [
        { day: '2026-03-14', skillId: 's1', minutes: 30, sessions: 1 },
        { day: '2026-03-13', skillId: 's1', minutes: 20, sessions: 1 },
        { day: '2026-03-12', skillId: 's1', minutes: 45, sessions: 1 },
      ],
    }) as unknown as RecommendationRawData

    const context = buildRecommendationContext(raw)

    expect(context.goalCompletion.dailyTargetMinutes).toBe(30)
    expect(context.goalCompletion.daysMeetingTarget).toBe(2)
    expect(context.goalCompletion.rate).toBe(Math.round((2 / 14) * 100))
  })

  it('takes the newest recorded level per dimension, not the newest row', () => {
    const raw = makeRawData({
      assessments: [
        {
          id: 'a2',
          assessedAt: new Date('2026-03-10T00:00:00Z'),
          method: 'MOCK_TEST',
          cefrLevel: null,
          listeningLevel: null,
          readingLevel: 'B2',
          writingLevel: null,
          speakingLevel: null,
        },
        {
          id: 'a1',
          assessedAt: new Date('2026-03-01T00:00:00Z'),
          method: 'SELF_REPORTED',
          cefrLevel: 'B1',
          listeningLevel: 'B1',
          readingLevel: null,
          writingLevel: 'C1',
          speakingLevel: null,
        },
      ],
    }) as unknown as RecommendationRawData

    const context = buildRecommendationContext(raw)

    expect(context.assessment.recorded).toBe(true)
    expect(context.assessment.levels.reading).toBe('B2')
    expect(context.assessment.levels.writing).toBe('C1')
    expect(context.assessment.levels.listening).toBe('B1')
    expect(context.assessment.levels.overall).toBe('B1')
  })

  it('carries no identity fields into the context', () => {
    const context = buildRecommendationContext(makeRawData() as unknown as RecommendationRawData)
    const serialized = JSON.stringify(context)

    expect(serialized).not.toContain('displayName')
    expect(serialized).not.toContain('timezone')
    expect(serialized).not.toContain('userId')
  })
})
