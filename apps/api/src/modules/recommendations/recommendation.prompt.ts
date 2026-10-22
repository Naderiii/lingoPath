/**
 * The model-facing half of the recommendation engine (Phase 10).
 *
 * Three things live here, and keeping them together is deliberate — a change to
 * one without the others is how prompt/schema drift starts:
 *
 * 1. the system prompt (the behavioural contract),
 * 2. the *redacted* payload projection (what the model is allowed to see),
 * 3. the Zod schema for the response, plus the reasoning guard that rejects prose
 *    which diagnoses ability, predicts a score or announces readiness.
 *
 * The projection is a whitelist. It is written field by field rather than by
 * spreading the internal context, so a field added to `RecommendationContext`
 * later cannot silently start leaving the building. There is no user id, no
 * display name, no timezone, no session, no note, no topic, no plan title and no
 * feedback history in what follows.
 */

import type { RecommendationDataPoint, RecommendationType } from '@lingopath/types'
import { z } from 'zod'
import type { CandidateRecommendation } from './recommendation.candidates.js'
import type { ConfidenceLevel, RecommendationContext } from './recommendation.context.js'
import type { RecommendationAnalysis, RecommendationSignal } from './recommendation.analysis.js'
import type { LlmRequest } from './recommendation.llm.js'

export const RECOMMENDATION_SYSTEM_PROMPT = `You write study recommendations for LingoPath, an English-learning planner.

You are decision support. You do not decide for the learner: your output is shown
alongside an accept / reject / postpone control, and nothing you write is applied
to their plan automatically.

Hard rules, in order of importance:

1. Use only facts present in the input JSON. Never invent a number, date, score,
   level or skill. If a fact is absent, do not imply it exists.
2. Practice is not ability. A gap in recent practice must be described as a gap in
   practice. Never call the learner weak, poor, bad, failing, hopeless or
   struggling, never call a skill their weakness, and never grade their level.
3. Mention an ability level only if it appears in "recordedAssessment" or in
   "recordedExamResults", and say that the level was recorded. When
   "recordedAssessment.recorded" is false, say nothing about ability at all.
4. Never predict a score, band, CEFR level, exam readiness or pass probability.
5. Choose entries only from the provided "candidates", one per candidateId. You may
   reorder, rephrase, shorten and merge wording. You may not add a candidate, and
   you must keep every candidate whose "mustInclude" is true.
6. Confidence must be at or below the candidate's "maxConfidence". Use HIGH only
   when the candidate allows it and the evidence genuinely supports it.
7. "estimatedDurationMinutes" is the length of one suggested study block, between
   5 and 480 minutes, or null when no block length makes sense.
8. Write in the second person, plainly and briefly. No hype, no praise, no
   moralising, no exclamation marks. Explain the comparison the recommendation is
   based on, so the learner can disagree with the reasoning.
9. Return JSON only, matching this shape exactly, with no markdown fences and no
   commentary outside the JSON:

{
  "recommendations": [
    {
      "candidateId": "c1",
      "title": "short imperative title",
      "recommendation": "what to do, in one or two sentences",
      "rationale": "why, naming the comparison and its numbers",
      "confidence": "LOW",
      "estimatedDurationMinutes": 30
    }
  ]
}`

// ─── Redacted projection ─────────────────────────────────────────────────────

export interface LlmContextPayload {
  today: string
  objective: {
    type: string
    targetScore: number | null
    targetDate: string | null
    daysUntilTargetDate: number | null
  } | null
  dataQuality: {
    level: ConfidenceLevel
    sessionCount: number
    activeDays: number
    assessmentRecorded: boolean
    examResultRecorded: boolean
    notes: string[]
  }
  activity: {
    windowDays: number
    recent: { minutes: number; sessions: number; activeDays: number }
    prior: { minutes: number; sessions: number; activeDays: number }
    lifetime: { minutes: number; sessions: number; activeDays: number }
    currentStreak: number
    longestStreak: number
    lastSessionDaysAgo: number | null
    medianSessionMinutes: number | null
    preferredStartHour: number | null
  }
  skills: Array<{
    name: string
    totalMinutes: number
    recentMinutes: number
    priorMinutes: number
    sharePercent: number
    lastPracticedDaysAgo: number | null
  }>
  goals: Array<{
    period: string
    targetMinutes: number
    actualMinutes: number
    percentComplete: number
    status: string
  }>
  goalCompletion: {
    trackedDays: number
    daysMeetingTarget: number
    dailyTargetMinutes: number | null
    ratePercent: number | null
    averageActiveDayMinutes: number
  }
  plans: Array<{
    targetMinutes: number
    actualMinutes: number
    studyProgressPercent: number
    timeProgressPercent: number
    remainingDays: number
    paceStatus: string
    requiredDailyMinutes: number
    currentMilestone: {
      targetMinutes: number
      actualMinutes: number
      progressPercent: number
      remainingDays: number
    } | null
  }>
  recordedAssessment: {
    recorded: boolean
    assessedOn: string | null
    method: string | null
    levels: Record<string, string | null>
  }
  recordedExamResults: Array<{
    examType: string
    status: string
    daysUntil: number | null
    targetScore: number | null
    latestResult: {
      daysAgo: number
      isMock: boolean
      overallScore: number | null
      skillScores: Record<string, number>
    } | null
  }>
}

export interface LlmCandidatePayload {
  candidateId: string
  type: RecommendationType
  title: string
  recommendation: string
  rationale: string
  supportingData: RecommendationDataPoint[]
  maxConfidence: ConfidenceLevel
  estimatedDurationMinutes: number | null
  mustInclude: boolean
}

export interface LlmRecommendationPayload {
  task: string
  confidenceCeiling: ConfidenceLevel
  ceilingRationale: string
  context: LlmContextPayload
  signals: Array<{
    kind: string
    severity: string
    evidence: RecommendationDataPoint[]
  }>
  candidates: LlmCandidatePayload[]
}

const MAX_SKILLS_IN_PAYLOAD = 8
const MAX_GOALS_IN_PAYLOAD = 6
const MAX_PLANS_IN_PAYLOAD = 3
const MAX_EXAMS_IN_PAYLOAD = 4
const MAX_SIGNALS_IN_PAYLOAD = 10

function percent(part: number, whole: number): number {
  if (whole <= 0) return 0
  return Math.round((part / whole) * 100)
}

/**
 * Projects the internal context onto the fields a model may see.
 *
 * Exported because the privacy test asserts on it directly: every field that
 * leaves this function is a decision someone made on purpose.
 */
export function toLlmContextPayload(
  context: RecommendationContext,
  analysis: RecommendationAnalysis,
): LlmContextPayload {
  const { activity } = context

  return {
    today: context.today,
    objective: context.objective
      ? {
          type: context.objective.type,
          targetScore: context.objective.targetScore,
          targetDate: context.objective.targetDate,
          daysUntilTargetDate: context.objective.daysUntilTargetDate,
        }
      : null,
    dataQuality: {
      level: analysis.dataQuality.level,
      sessionCount: analysis.dataQuality.sessionCount,
      activeDays: analysis.dataQuality.activeDays,
      assessmentRecorded: analysis.dataQuality.assessmentRecorded,
      examResultRecorded: analysis.dataQuality.examResultRecorded,
      notes: analysis.dataQuality.notes,
    },
    activity: {
      windowDays: activity.windowDays,
      recent: {
        minutes: activity.recent.minutes,
        sessions: activity.recent.sessions,
        activeDays: activity.recent.activeDays,
      },
      prior: {
        minutes: activity.prior.minutes,
        sessions: activity.prior.sessions,
        activeDays: activity.prior.activeDays,
      },
      lifetime: {
        minutes: activity.lifetime.minutes,
        sessions: activity.lifetime.sessions,
        activeDays: activity.lifetime.activeDays,
      },
      currentStreak: activity.currentStreak,
      longestStreak: activity.longestStreak,
      lastSessionDaysAgo: activity.lastSessionDaysAgo,
      medianSessionMinutes: activity.medianSessionMinutes,
      preferredStartHour: activity.preferredStartHour,
    },
    skills: context.skills
      .filter((skill) => skill.totalMinutes > 0 || skill.referencedByGoal || skill.referencedByPlan)
      .slice(0, MAX_SKILLS_IN_PAYLOAD)
      .map((skill) => ({
        name: skill.name,
        totalMinutes: skill.totalMinutes,
        recentMinutes: skill.recentMinutes,
        priorMinutes: skill.priorMinutes,
        sharePercent: percent(skill.totalMinutes, activity.lifetime.minutes),
        lastPracticedDaysAgo: skill.lastPracticedDaysAgo,
      })),
    goals: context.goals.slice(0, MAX_GOALS_IN_PAYLOAD).map((goal) => ({
      period: goal.period,
      targetMinutes: goal.targetMinutes,
      actualMinutes: goal.actualMinutes,
      percentComplete: goal.percentage,
      status: goal.status,
    })),
    goalCompletion: {
      trackedDays: context.goalCompletion.trackedDays,
      daysMeetingTarget: context.goalCompletion.daysMeetingTarget,
      dailyTargetMinutes: context.goalCompletion.dailyTargetMinutes,
      ratePercent: context.goalCompletion.rate,
      averageActiveDayMinutes: context.goalCompletion.averageActiveDayMinutes,
    },
    plans: context.plans.slice(0, MAX_PLANS_IN_PAYLOAD).map((plan) => ({
      targetMinutes: plan.targetMinutes,
      actualMinutes: plan.actualMinutes,
      studyProgressPercent: plan.studyProgressPercent,
      timeProgressPercent: plan.timeProgressPercent,
      remainingDays: plan.remainingDays,
      paceStatus: plan.paceStatus,
      requiredDailyMinutes: plan.requiredDailyMinutes,
      currentMilestone: plan.currentMilestone
        ? {
            targetMinutes: plan.currentMilestone.targetMinutes,
            actualMinutes: plan.currentMilestone.actualMinutes,
            progressPercent: plan.currentMilestone.progressPercent,
            remainingDays: plan.currentMilestone.remainingDays,
          }
        : null,
    })),
    recordedAssessment: {
      recorded: context.assessment.recorded,
      assessedOn: context.assessment.assessedOn,
      method: context.assessment.method,
      levels: { ...context.assessment.levels },
    },
    recordedExamResults: context.exams.slice(0, MAX_EXAMS_IN_PAYLOAD).map((exam) => ({
      examType: exam.type,
      status: exam.status,
      daysUntil: exam.daysUntil,
      targetScore: exam.targetScore,
      latestResult: exam.latestResult
        ? {
            daysAgo: exam.latestResult.takenDaysAgo,
            isMock: exam.latestResult.isMock,
            overallScore: exam.latestResult.overallScore,
            skillScores: { ...exam.latestResult.skillScores },
          }
        : null,
    })),
  }
}

/** `c1`, `c2`, … — short, stable within one generation, and free of database ids. */
export function promptIdFor(index: number): string {
  return `c${index + 1}`
}

function isMustInclude(signal: RecommendationSignal): boolean {
  return signal.severity === 'ATTENTION'
}

/**
 * Builds the payload plus the prompt text.
 *
 * `candidateId` in the payload is `c1…cN`, not the internal id: the model only
 * needs a handle to pick from, and handing it database identifiers would be an
 * unnecessary disclosure with no upside.
 */
export function buildRecommendationPayload(input: {
  context: RecommendationContext
  analysis: RecommendationAnalysis
  candidates: readonly CandidateRecommendation[]
  signals: readonly RecommendationSignal[]
}): LlmRecommendationPayload {
  const { context, analysis, candidates, signals } = input

  const signalById = new Map(signals.map((signal) => [signal.id, signal]))

  return {
    task: 'Rewrite the selected candidates as learner-facing recommendations. Keep every candidate marked mustInclude and stay within each maxConfidence.',
    confidenceCeiling: analysis.confidenceCeiling,
    ceilingRationale: analysis.ceilingRationale,
    context: toLlmContextPayload(context, analysis),
    signals: signals
      .filter((signal) => signal.candidateEligible)
      .slice(0, MAX_SIGNALS_IN_PAYLOAD)
      .map((signal) => ({
        kind: signal.kind,
        severity: signal.severity,
        evidence: signal.evidence,
      })),
    candidates: candidates.map((candidate, index) => {
      const firstSignal = candidate.signalIds[0]
      const signal = firstSignal === undefined ? undefined : signalById.get(firstSignal)
      return {
        candidateId: promptIdFor(index),
        type: candidate.type,
        title: candidate.title,
        recommendation: candidate.recommendation,
        rationale: candidate.rationale,
        supportingData: candidate.supportingData,
        maxConfidence: candidate.confidence,
        estimatedDurationMinutes: candidate.estimatedDurationMinutes,
        mustInclude: signal === undefined ? false : isMustInclude(signal),
      }
    }),
  }
}

export function buildRecommendationPrompt(input: {
  context: RecommendationContext
  analysis: RecommendationAnalysis
  candidates: readonly CandidateRecommendation[]
  signals: readonly RecommendationSignal[]
}): LlmRequest {
  const payload = buildRecommendationPayload(input)

  return {
    system: RECOMMENDATION_SYSTEM_PROMPT,
    user: JSON.stringify(payload, null, 2),
    maxOutputTokens: 1200,
  }
}

// ─── Response contract ───────────────────────────────────────────────────────

/**
 * The model's output contract.
 *
 * `.strict()` on both objects is deliberate: an unexpected field means the model
 * is improvising a shape we did not ask for, and the engine would rather fall back
 * to its own wording than persist a document it cannot fully account for.
 */
export const LlmRecommendationItemSchema = z
  .object({
    candidateId: z.string().min(1).max(32),
    title: z.string().trim().min(3).max(140),
    recommendation: z.string().trim().min(10).max(600),
    rationale: z.string().trim().min(10).max(900),
    confidence: z.enum(['LOW', 'MEDIUM', 'HIGH']),
    estimatedDurationMinutes: z.number().int().min(5).max(480).nullable().default(null),
  })
  .strict()

export const LlmRecommendationResponseSchema = z
  .object({
    recommendations: z.array(LlmRecommendationItemSchema).min(1).max(10),
  })
  .strict()

export type LlmRecommendationItem = z.infer<typeof LlmRecommendationItemSchema>

/**
 * Pulls a JSON document out of a completion.
 *
 * Models occasionally wrap JSON in a markdown fence or precede it with a sentence
 * even when told not to. Tolerating that is not the same as tolerating malformed
 * content: whatever comes out still has to satisfy the schema above, and anything
 * that does not is rejected. Returns `null` when there is no object to find.
 */
export function extractJsonDocument(text: string): string | null {
  const trimmed = text.trim()
  if (trimmed.length === 0) return null

  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed)
  const body = fenced && fenced[1] !== undefined ? fenced[1].trim() : trimmed

  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start === -1 || end <= start) return null

  return body.slice(start, end + 1)
}

// ─── Reasoning guard ─────────────────────────────────────────────────────────

export interface ReasoningViolation {
  id: string
  description: string
}

const REASONING_VIOLATIONS: Array<ReasoningViolation & { pattern: RegExp }> = [
  {
    id: 'ability-verdict',
    pattern:
      /\b(?:you(?:'re| are)|your \w+) (?:is |are |seem|seems|look|looks )?(?:weak|poor|bad|failing|hopeless)\b/i,
    description: 'describes the learner or a skill as weak/poor/bad',
  },
  {
    id: 'weakness-claim',
    pattern:
      /\bweak(?:ness|nesses)? (?:in|at) (?:your )?(?:writing|reading|listening|speaking|grammar|vocabulary|pronunciation|conversation)\b/i,
    description: 'names a skill as a weakness',
  },
  {
    id: 'skill-is-weak',
    pattern:
      /\b(?:writing|reading|listening|speaking|grammar|vocabulary|pronunciation|conversation) (?:is|remains|looks) (?:weak|poor|bad|your weakness)\b/i,
    description: 'grades a skill',
  },
  {
    id: 'weakest-skill',
    pattern: /\b(?:weakest|weaker than|weak spot|weak point)\b/i,
    description: 'ranks the learner or a skill as the weakest',
  },
  {
    id: 'ability-deficit',
    pattern: /\bbelow average\b/i,
    description: 'states an ability deficit',
  },
  {
    id: 'poor-at',
    pattern: /\bpoor (?:at|in)\b|\bbad at\b|\bstruggling (?:with|in)\b/i,
    description: 'states an ability deficit',
  },
  {
    id: 'score-prediction',
    pattern:
      /\b(?:you(?:'ll| will) (?:get|achieve|score|reach)|predicted (?:score|band|level)|expected (?:score|band))\b/i,
    description: 'predicts a score or band',
  },
  {
    id: 'readiness-verdict',
    pattern:
      /\b(?:you(?:'re| are) (?:exam[- ])?ready|not ready for the exam|ready to take the (?:ielts|toefl))\b/i,
    description: 'declares exam readiness',
  },
  {
    id: 'guarantee',
    pattern: /\bguarantee[ds]?\b|\bwill definitely\b/i,
    description: 'promises an outcome',
  },
]

/**
 * Returns the first reasoning rule a piece of model-written prose breaks.
 *
 * This is a guard, not a proof: it catches the failure modes that matter most
 * (diagnosing ability, predicting scores, promising readiness) and lets everything
 * else through to the schema and length checks. The built-in wording is held to
 * the same rules by a test, so the fallback can never be the looser path.
 */
export function findReasoningViolation(text: string): ReasoningViolation | null {
  for (const violation of REASONING_VIOLATIONS) {
    if (violation.pattern.test(text)) {
      return { id: violation.id, description: violation.description }
    }
  }
  return null
}

/** Every rule, exposed so a guard test can assert the built-in wording passes. */
export function listReasoningViolations(): ReasoningViolation[] {
  return REASONING_VIOLATIONS.map(({ id, description }) => ({ id, description }))
}
