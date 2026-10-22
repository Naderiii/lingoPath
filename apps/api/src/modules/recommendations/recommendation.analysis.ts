/**
 * Analysis stage of the recommendation pipeline (Phase 10).
 *
 * Turns the aggregated context into *observations* — signals — and a statement
 * about how much evidence exists. Nothing here writes prose for the learner yet,
 * and nothing here calls a model. Keeping analysis pure is what lets the whole
 * reasoning contract be tested without an LLM and without a database.
 *
 * The central rule of this phase lives here, structurally rather than as a prompt
 * instruction:
 *
 * > low recent practice is not weak ability.
 *
 * There is no signal kind for "weak", "poor" or "behind" ability, and no signal
 * may cite an ability claim from `STUDY_SESSIONS`. Practice signals cite study
 * sessions; ability statements cite `RECORDED_ASSESSMENT` or
 * `RECORDED_EXAM_RESULT`, or they do not exist. When no assessment is recorded the
 * ability-dependent signals are skipped entirely, so the engine cannot invent a
 * weakness it has no evidence for.
 *
 * Every signal also carries a coarse `evidenceTag`. Two generations whose tokens
 * match for the same signal rest on materially identical facts, which is what makes
 * "you rejected this already, and nothing changed" answerable later.
 */

import type { CefrLevel, LevelDimension, RecommendationType } from '@lingopath/types'
import type { RecommendationDataPoint } from '@lingopath/types'
import { cefrRank, LEVEL_DIMENSIONS } from '../assessments/level.domain.js'
import type {
  ConfidenceLevel,
  ContextSkill,
  RecommendationContext,
} from './recommendation.context.js'

export type SignalKind =
  | 'ZERO_STUDY_HISTORY'
  | 'INSUFFICIENT_HISTORY'
  | 'WEAK_CONSISTENCY'
  | 'RECENT_PRACTICE_LOW'
  | 'STRONG_CONSISTENCY'
  | 'SKILL_NOT_PRACTICED'
  | 'SKILL_LOW_SHARE'
  | 'SKILL_CONCENTRATED'
  | 'SKILL_BALANCED'
  | 'SKILL_PRACTICE_DROPPED'
  | 'RECORDED_STRENGTH_UNPRACTISED'
  | 'RECORDED_LEVEL_LOWER'
  | 'NO_ASSESSMENT_DATA'
  | 'MISSED_GOALS'
  | 'GOALS_ON_TRACK'
  | 'CONFLICTING_GOALS'
  | 'DURATION_PATTERN'
  | 'UPCOMING_EXAM'
  | 'EXAM_WITHOUT_RECENT_RESULT'
  | 'EXAM_HORIZON'
  | 'RECORDED_SCORE_VS_TARGET'
  | 'EXAM_MISSING_FOR_OBJECTIVE'
  | 'PLAN_BEHIND'
  | 'PLAN_UNREALISTIC_PACE'
  | 'OBJECTIVE_MISSING'

export type SignalSeverity = 'ATTENTION' | 'INFO' | 'POSITIVE'

export interface RecommendationSignal {
  /** Stable across generations: kind plus the entity it is about. */
  id: string
  kind: SignalKind
  type: RecommendationType
  severity: SignalSeverity
  /** Higher sorts first; only used for ATTENTION signals. */
  priority: number
  evidence: RecommendationDataPoint[]
  /** Coarse fingerprint contribution — see the module comment. */
  evidenceTag: string
  /** The most confidence this evidence can honestly support. */
  maxConfidence: ConfidenceLevel
  /** `false` for data gaps that inform the caller but must not become advice. */
  candidateEligible: boolean
  /** Structured values the wording needs, so it never parses its own prose. */
  facts?: Record<string, string | number> | undefined
  skillId?: string | undefined
  goalId?: string | undefined
  planId?: string | undefined
  examId?: string | undefined
}

export interface RecommendationDataQuality {
  level: ConfidenceLevel
  sessionCount: number
  activeDays: number
  assessmentRecorded: boolean
  examResultRecorded: boolean
  notes: string[]
}

export interface RecommendationAnalysis {
  signals: RecommendationSignal[]
  dataQuality: RecommendationDataQuality
  /** Hard ceiling every recommendation inherits, whatever its own evidence says. */
  confidenceCeiling: ConfidenceLevel
  /** Why the ceiling is what it is, in one sentence. */
  ceilingRationale: string
}

// ─── Thresholds ──────────────────────────────────────────────────────────────
//
// Deliberately coarse. A recommendation engine that draws a line at 41 versus 42
// minutes is pretending to a precision it does not have.

/** At or below this many sessions, nothing above LOW is defensible. */
export const CONFIDENCE_LOW_MAX_SESSIONS = 3
/** Below this many sessions the ceiling stays MEDIUM. */
export const CONFIDENCE_MEDIUM_MAX_SESSIONS = 10
/** HIGH additionally requires this many active days… */
export const CONFIDENCE_HIGH_MIN_ACTIVE_DAYS = 10
/** …and at least this many sessions. */
export const CONFIDENCE_HIGH_MIN_SESSIONS = 20

/** A skill whose last session is this old counts as "not practised recently". */
export const SKILL_NEGLECT_DAYS = 14
/** Below this share of study time a skill is under-weighted. */
export const SKILL_SHARE_FLOOR = 0.08
/** Above this share, one skill dominates. */
export const SKILL_SHARE_CEILING = 0.45
/** Above this share, concentration is worth naming even without a rebalance target. */
export const SKILL_CONCENTRATION_REPORT_PERCENT = 60
/** The least-practised skill counts as under-weighted below half the top one. */
export const SKILL_LOW_SHARE_RELATIVE_FLOOR = 0.5
/** "Recent practice dropped": recent minutes at or below this fraction of prior. */
export const RECENT_PRACTICE_DROP_RATIO = 0.5
/** Prior window must reach this many minutes before a drop is worth reporting. */
export const RECENT_PRACTICE_MIN_BASELINE_MINUTES = 60
/** Consistency: a gap at least this long breaks a habit. */
export const CONSISTENCY_GAP_DAYS = 5
/** Consistency: a streak at least this long is worth protecting. */
export const CONSISTENCY_STRONG_STREAK_DAYS = 7
/** Goal completion below this percentage is worth a recommendation. */
export const GOAL_COMPLETION_FLOOR_PERCENT = 50
/** …and at or above this percentage is worth acknowledging. */
export const GOAL_COMPLETION_STRONG_PERCENT = 80
/** Days of daily-goal history required before judging completion. */
export const GOAL_COMPLETION_MIN_DAYS = 7
/**
 * Days the learner must actually have studied before completion means anything.
 *
 * `trackedDays` counts calendar days, not attempts. A learner who logged three
 * sessions in a fortnight has not tested a 60-minute target; calling that target
 * "too large" would confuse absence with calibration. Below this floor the
 * consistency signals are the honest ones, and goal completion is not judged.
 */
export const GOAL_COMPLETION_MIN_ACTIVE_DAYS = 7
/** An exam this close changes what to study. */
export const UPCOMING_EXAM_DAYS = 60
/** Beyond the countdown, an exam this far out still shapes the plan. */
export const EXAM_HORIZON_DAYS = 180
/** A result older than this no longer describes the current preparation. */
export const STALE_EXAM_RESULT_DAYS = 21
/** A plan needing more than this per day is not a realistic pace. */
export const MAX_REALISTIC_DAILY_MINUTES = 180
/** Below this many median minutes, blocks are short enough to lengthen. */
export const SHORT_SESSION_MEDIAN_MINUTES = 20
/** At or above this, blocks are long enough to consider splitting. */
export const LONG_SESSION_MEDIAN_MINUTES = 90
/** Minimum sessions before a duration pattern is worth acting on. */
export const MIN_SESSIONS_FOR_PATTERN = 5
/** Recorded levels must cover at least this many dimensions to be compared. */
export const MIN_RECORDED_DIMENSIONS_TO_COMPARE = 2

const BAND_ORDER: Record<ConfidenceLevel, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 }

/** The lower of two bands. Used everywhere a ceiling applies. */
export function minConfidence(a: ConfidenceLevel, b: ConfidenceLevel): ConfidenceLevel {
  return BAND_ORDER[a] <= BAND_ORDER[b] ? a : b
}

/** Coarse bucket for a day count, so trivial drift does not look like new evidence. */
export function coarseDays(days: number | null): string {
  if (days === null) return 'never'
  if (days <= 0) return 'today'
  if (days <= 7) return '1-7'
  if (days <= 14) return '8-14'
  if (days <= 30) return '15-30'
  return '30+'
}

/** Coarse bucket for a minute count. */
export function coarseMinutes(minutes: number): string {
  if (minutes <= 0) return '0'
  if (minutes < 60) return '<60'
  if (minutes < 180) return '60-180'
  if (minutes < 600) return '180-600'
  return '600+'
}

/** Coarse bucket for a percentage. */
export function coarsePercent(percent: number): string {
  if (percent <= 0) return '0'
  if (percent < 25) return '1-25'
  if (percent < 50) return '25-50'
  if (percent < 75) return '50-75'
  if (percent < 100) return '75-100'
  return '100'
}

/**
 * How much evidence the account holds, expressed as the highest band that can be
 * honestly claimed. One session cannot support "HIGH" however emphatic it is.
 *
 * This is a sufficiency rule, not a probability: it says "this much evidence
 * exists", and the client repeats that framing verbatim.
 */
export function resolveConfidenceCeiling(input: {
  sessionCount: number
  activeDays: number
  hasAssessment: boolean
  hasExamResult: boolean
}): { level: ConfidenceLevel; rationale: string } {
  const { sessionCount, activeDays, hasAssessment, hasExamResult } = input

  if (sessionCount === 0) {
    return {
      level: 'LOW',
      rationale: 'No study sessions are recorded, so there is no practice evidence to lean on.',
    }
  }

  if (sessionCount <= CONFIDENCE_LOW_MAX_SESSIONS) {
    return {
      level: 'LOW',
      rationale: `${sessionCount} recorded session${sessionCount === 1 ? '' : 's'} is too little history for more than a low band.`,
    }
  }

  const recordedEvidence = hasAssessment || hasExamResult

  if (
    sessionCount >= CONFIDENCE_HIGH_MIN_SESSIONS &&
    activeDays >= CONFIDENCE_HIGH_MIN_ACTIVE_DAYS &&
    recordedEvidence
  ) {
    return {
      level: 'HIGH',
      rationale: `${sessionCount} sessions across ${activeDays} active days, plus recorded assessment or exam data.`,
    }
  }

  if (sessionCount >= CONFIDENCE_MEDIUM_MAX_SESSIONS) {
    return {
      level: 'MEDIUM',
      rationale: recordedEvidence
        ? `${sessionCount} sessions across ${activeDays} active days; not yet enough history for a high band.`
        : `${sessionCount} sessions across ${activeDays} active days, with no recorded assessment or exam result to anchor ability claims.`,
    }
  }

  return {
    level: 'MEDIUM',
    rationale: `${sessionCount} sessions is enough to see a pattern, not enough to be confident about it.`,
  }
}

// ─── Skill/dimension mapping ─────────────────────────────────────────────────

/** CEFR dimensions that map onto a study skill. `overall` maps to nothing. */
const DIMENSION_SKILL_NAMES: Partial<Record<LevelDimension, string>> = {
  listening: 'Listening',
  reading: 'Reading',
  writing: 'Writing',
  speaking: 'Speaking',
}

function findSkillForDimension(
  skills: readonly ContextSkill[],
  dimension: LevelDimension,
): ContextSkill | null {
  const name = DIMENSION_SKILL_NAMES[dimension]
  if (!name) return null
  return skills.find((skill) => skill.name.toLowerCase() === name.toLowerCase()) ?? null
}

// ─── Analysis ────────────────────────────────────────────────────────────────

interface SignalInput {
  id: string
  kind: SignalKind
  type: RecommendationType
  severity: SignalSeverity
  priority: number
  evidence: RecommendationDataPoint[]
  evidenceTag: string
  maxConfidence: ConfidenceLevel
  candidateEligible?: boolean
  facts?: Record<string, string | number>
  skillId?: string
  goalId?: string
  planId?: string
  examId?: string
}

function makeSignal(input: SignalInput): RecommendationSignal {
  return {
    id: input.id,
    kind: input.kind,
    type: input.type,
    severity: input.severity,
    priority: input.priority,
    evidence: input.evidence,
    evidenceTag: input.evidenceTag,
    maxConfidence: input.maxConfidence,
    candidateEligible: input.candidateEligible ?? true,
    ...(input.facts !== undefined ? { facts: input.facts } : {}),
    ...(input.skillId !== undefined ? { skillId: input.skillId } : {}),
    ...(input.goalId !== undefined ? { goalId: input.goalId } : {}),
    ...(input.planId !== undefined ? { planId: input.planId } : {}),
    ...(input.examId !== undefined ? { examId: input.examId } : {}),
  }
}

function minutesLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest} min`
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`
}

/**
 * Produces the signal list for one context.
 *
 * Ordering is deterministic: ATTENTION by priority, then by id; POSITIVE before
 * INFO; the caller slices the list, so a stable order means a stable set of
 * candidates for identical evidence.
 */
export function analyzeContext(context: RecommendationContext): RecommendationAnalysis {
  const signals: RecommendationSignal[] = []
  const notes: string[] = []

  const { activity, assessment, goalCompletion, skills, goals, plans, exams, objective } = context
  const sessionCount = activity.lifetime.sessions
  const hasExamResult = exams.some((exam) => exam.latestResult !== null)

  // ── Volume and confidence ─────────────────────────────────────────────────
  if (sessionCount === 0) {
    signals.push(
      makeSignal({
        id: 'history:empty',
        kind: 'ZERO_STUDY_HISTORY',
        type: 'CONSISTENCY',
        severity: 'ATTENTION',
        priority: 30,
        maxConfidence: 'LOW',
        evidenceTag: 'ZERO_STUDY_HISTORY|0',
        evidence: [
          {
            label: 'Study sessions recorded',
            value: '0',
            source: 'STUDY_SESSIONS',
          },
        ],
      }),
    )
    notes.push(
      'No study sessions are recorded yet, so no observation about your practice can be made.',
    )
  } else if (sessionCount <= CONFIDENCE_LOW_MAX_SESSIONS) {
    signals.push(
      makeSignal({
        id: 'history:insufficient',
        kind: 'INSUFFICIENT_HISTORY',
        type: 'CONSISTENCY',
        severity: 'ATTENTION',
        priority: 30,
        maxConfidence: 'LOW',
        evidenceTag: `INSUFFICIENT_HISTORY|sessions=${sessionCount}`,
        evidence: [
          {
            label: 'Study sessions recorded',
            value: `${sessionCount}`,
            source: 'STUDY_SESSIONS',
          },
          {
            label: 'Active days',
            value: `${activity.lifetime.activeDays}`,
            source: 'CALENDAR',
          },
        ],
      }),
    )
    notes.push(
      `Only ${sessionCount} session${sessionCount === 1 ? '' : 's'} recorded — every recommendation from this data is a low-confidence observation, not a conclusion.`,
    )
  }

  // ── Consistency ───────────────────────────────────────────────────────────
  if (sessionCount > CONFIDENCE_LOW_MAX_SESSIONS) {
    const gap = activity.lastSessionDaysAgo
    const weak = (gap !== null && gap >= CONSISTENCY_GAP_DAYS) || activity.recent.activeDays <= 2

    if (weak && activity.currentStreak <= 2) {
      signals.push(
        makeSignal({
          id: 'consistency:gap',
          kind: 'WEAK_CONSISTENCY',
          type: 'CONSISTENCY',
          severity: 'ATTENTION',
          priority: 40,
          maxConfidence: 'MEDIUM',
          evidenceTag: `WEAK_CONSISTENCY|gap=${coarseDays(gap)}|active=${activity.recent.activeDays}`,
          evidence: [
            {
              label: 'Days since your last session',
              value: gap === null ? 'no session recorded' : `${gap}`,
              source: 'STUDY_SESSIONS',
            },
            {
              label: `Active days in the last ${activity.recent.days}`,
              value: `${activity.recent.activeDays} of ${activity.recent.days}`,
              source: 'CALENDAR',
            },
            {
              label: 'Current streak',
              value: `${activity.currentStreak} day${activity.currentStreak === 1 ? '' : 's'}`,
              source: 'CALENDAR',
            },
          ],
        }),
      )
    }

    if (
      activity.currentStreak >= CONSISTENCY_STRONG_STREAK_DAYS &&
      activity.recent.activeDays >= 10
    ) {
      signals.push(
        makeSignal({
          id: 'consistency:strong',
          kind: 'STRONG_CONSISTENCY',
          type: 'CONSISTENCY',
          severity: 'POSITIVE',
          priority: 210,
          maxConfidence: 'HIGH',
          evidenceTag: `STRONG_CONSISTENCY|streak=${activity.currentStreak >= 14 ? '14+' : activity.currentStreak}`,
          evidence: [
            {
              label: 'Current streak',
              value: `${activity.currentStreak} days`,
              source: 'CALENDAR',
            },
            {
              label: `Active days in the last ${activity.recent.days}`,
              value: `${activity.recent.activeDays} of ${activity.recent.days}`,
              source: 'CALENDAR',
            },
            {
              label: `Time studied in the last ${activity.recent.days} days`,
              value: minutesLabel(activity.recent.minutes),
              source: 'STUDY_SESSIONS',
            },
          ],
        }),
      )
    }

    if (
      activity.prior.minutes >= RECENT_PRACTICE_MIN_BASELINE_MINUTES &&
      activity.recent.minutes <= activity.prior.minutes * RECENT_PRACTICE_DROP_RATIO
    ) {
      signals.push(
        makeSignal({
          id: 'consistency:recent-drop',
          kind: 'RECENT_PRACTICE_LOW',
          type: 'CONSISTENCY',
          severity: 'ATTENTION',
          priority: 45,
          maxConfidence: 'MEDIUM',
          evidenceTag: `RECENT_PRACTICE_LOW|recent=${coarseMinutes(activity.recent.minutes)}|prior=${coarseMinutes(activity.prior.minutes)}`,
          evidence: [
            {
              label: `Time studied in the last ${activity.recent.days} days`,
              value: minutesLabel(activity.recent.minutes),
              source: 'STUDY_SESSIONS',
            },
            {
              label: `Time studied in the ${activity.prior.days} days before that`,
              value: minutesLabel(activity.prior.minutes),
              source: 'STUDY_SESSIONS',
            },
          ],
        }),
      )
    }
  }

  // ── Skills: practice recency and balance ──────────────────────────────────
  // Only skills the learner has actually studied, or named in a goal or a plan
  // milestone, are considered. A taxonomy skill nobody ever mentioned is not a
  // gap — recommending it would be inventing a want.
  const relevantSkills = skills.filter(
    (skill) => skill.totalSessions > 0 || skill.referencedByGoal || skill.referencedByPlan,
  )

  // Recorded ability per skill. It is used only to keep the two facts apart in the
  // wording — never as an input to a practice judgement.
  const recordedLevelBySkill = new Map<string, CefrLevel>()
  for (const dimension of LEVEL_DIMENSIONS) {
    const level = assessment.levels[dimension]
    if (level === null) continue
    const skill = findSkillForDimension(skills, dimension)
    if (skill !== null) recordedLevelBySkill.set(skill.id, level)
  }

  // Per-skill practice *volume*, not recency. A skill can be practised this week
  // and still be practised far less than it was a fortnight ago; that is a
  // frequency observation, and it is one the engine could not make while it only
  // looked at gaps between sessions.
  const practiceDropped = relevantSkills
    .filter(
      (skill) =>
        skill.totalMinutes > 0 &&
        skill.priorMinutes >= RECENT_PRACTICE_MIN_BASELINE_MINUTES &&
        skill.recentMinutes <= skill.priorMinutes * RECENT_PRACTICE_DROP_RATIO,
    )
    .sort((a, b) => b.priorMinutes - b.recentMinutes - (a.priorMinutes - a.recentMinutes))
    .slice(0, 2)

  for (const skill of practiceDropped) {
    const recordedLevel = recordedLevelBySkill.get(skill.id) ?? null
    signals.push(
      makeSignal({
        id: `skill:practice-drop:${skill.id}`,
        kind: 'SKILL_PRACTICE_DROPPED',
        type: 'SKILL',
        severity: 'ATTENTION',
        priority: 54,
        maxConfidence: 'MEDIUM',
        skillId: skill.id,
        facts: {
          recentMinutes: skill.recentMinutes,
          priorMinutes: skill.priorMinutes,
          ...(recordedLevel !== null ? { level: recordedLevel } : {}),
        },
        evidenceTag: `SKILL_PRACTICE_DROPPED|skill=${skill.id}|recent=${coarseMinutes(skill.recentMinutes)}|prior=${coarseMinutes(skill.priorMinutes)}`,
        evidence: [
          {
            label: `Time on ${skill.name} in the last ${activity.recent.days} days`,
            value: minutesLabel(skill.recentMinutes),
            source: 'STUDY_SESSIONS',
          },
          {
            label: `Time on ${skill.name} in the ${activity.prior.days} days before that`,
            value: minutesLabel(skill.priorMinutes),
            source: 'STUDY_SESSIONS',
          },
          ...(recordedLevel !== null
            ? [
                {
                  label: `Recorded ${skill.name.toLowerCase()} level`,
                  value: recordedLevel,
                  source: 'RECORDED_ASSESSMENT' as const,
                },
              ]
            : []),
        ],
      }),
    )
  }

  const neglected = relevantSkills
    .filter(
      (skill) => skill.totalSessions > 0 && (skill.lastPracticedDaysAgo ?? 0) >= SKILL_NEGLECT_DAYS,
    )
    .sort((a, b) => (b.lastPracticedDaysAgo ?? 0) - (a.lastPracticedDaysAgo ?? 0))
    .slice(0, 2)

  for (const skill of neglected) {
    signals.push(
      makeSignal({
        id: `skill:not-practised:${skill.id}`,
        kind: 'SKILL_NOT_PRACTICED',
        type: 'SKILL',
        severity: 'ATTENTION',
        priority: 60,
        maxConfidence: 'MEDIUM',
        skillId: skill.id,
        evidenceTag: `SKILL_NOT_PRACTICED|skill=${skill.id}|days=${coarseDays(skill.lastPracticedDaysAgo)}`,
        evidence: [
          {
            label: `Days since your last ${skill.name} session`,
            value: `${skill.lastPracticedDaysAgo}`,
            source: 'STUDY_SESSIONS',
          },
          {
            label: `All-time ${skill.name} time`,
            value: minutesLabel(skill.totalMinutes),
            source: 'STUDY_SESSIONS',
          },
          {
            label: `${skill.name} share of your study time`,
            value: `${Math.round(skill.share * 100)}%`,
            source: 'STUDY_SESSIONS',
          },
        ],
      }),
    )
  }

  const studiedSkills = relevantSkills.filter((skill) => skill.totalMinutes > 0)
  const topSkill = [...studiedSkills].sort((a, b) => b.share - a.share)[0]

  // The least-practised skill is looked for among every *relevant* skill, not only
  // the ones with minutes: a skill the learner named in a goal or a plan but never
  // timed is the clearest imbalance there is. A taxonomy skill nobody ever
  // mentioned stays excluded — naming it would invent a want.
  const leastPractised = [...relevantSkills]
    .filter((skill) => skill.id !== topSkill?.id)
    .sort((a, b) => a.share - b.share || a.totalMinutes - b.totalMinutes)[0]

  const dominant = topSkill !== undefined && topSkill.share >= SKILL_SHARE_CEILING
  const underWeighted =
    dominant &&
    topSkill !== undefined &&
    leastPractised !== undefined &&
    (leastPractised.share < SKILL_SHARE_FLOOR ||
      leastPractised.share <= topSkill.share * SKILL_LOW_SHARE_RELATIVE_FLOOR)

  if (underWeighted && topSkill && leastPractised) {
    signals.push(
      makeSignal({
        id: `balance:skewed:${leastPractised.id}`,
        kind: 'SKILL_LOW_SHARE',
        type: 'BALANCE',
        severity: 'ATTENTION',
        priority: 80,
        maxConfidence: 'MEDIUM',
        skillId: leastPractised.id,
        evidenceTag: `SKILL_LOW_SHARE|top=${topSkill.id}:${coarsePercent(Math.round(topSkill.share * 100))}|low=${leastPractised.id}:${coarsePercent(Math.round(leastPractised.share * 100))}`,
        evidence: [
          {
            label: `${topSkill.name} share of your study time`,
            value: `${Math.round(topSkill.share * 100)}%`,
            source: 'STUDY_SESSIONS',
          },
          {
            label: `${leastPractised.name} share of your study time`,
            value: `${Math.round(leastPractised.share * 100)}%`,
            source: 'STUDY_SESSIONS',
          },
          {
            label: 'Skills with recorded study time',
            value: `${studiedSkills.length}`,
            source: 'STUDY_SESSIONS',
          },
        ],
      }),
    )
  } else if (
    topSkill !== undefined &&
    dominant &&
    (studiedSkills.length <= 1 ||
      topSkill.share * 100 >= SKILL_CONCENTRATION_REPORT_PERCENT)
  ) {
    // Concentration without a defensible rebalance target: either nothing else has
    // been timed, or the remaining skills are close enough that singling one out
    // would be arbitrary. The observation is still true and still useful, so it is
    // reported about the split rather than turned into advice about a skill.
    signals.push(
      makeSignal({
        id: 'balance:concentrated',
        kind: 'SKILL_CONCENTRATED',
        type: 'BALANCE',
        severity: 'ATTENTION',
        priority: 85,
        maxConfidence: 'MEDIUM',
        facts: {
          topName: topSkill.name,
          topPercent: Math.round(topSkill.share * 100),
          studied: studiedSkills.length,
        },
        evidenceTag: `SKILL_CONCENTRATED|top=${topSkill.id}:${coarsePercent(Math.round(topSkill.share * 100))}|skills=${studiedSkills.length}`,
        evidence: [
          {
            label: `${topSkill.name} share of your study time`,
            value: `${Math.round(topSkill.share * 100)}%`,
            source: 'STUDY_SESSIONS',
          },
          {
            label: 'Skills with recorded study time',
            value: `${studiedSkills.length}`,
            source: 'STUDY_SESSIONS',
          },
          {
            label: 'Skills named by an active goal or plan',
            value: `${relevantSkills.filter((skill) => skill.referencedByGoal || skill.referencedByPlan).length}`,
            source: 'GOALS',
          },
        ],
      }),
    )
  } else if (
    studiedSkills.length >= 3 &&
    topSkill !== undefined &&
    !dominant
  ) {
    signals.push(
      makeSignal({
        id: 'balance:even',
        kind: 'SKILL_BALANCED',
        type: 'BALANCE',
        severity: 'POSITIVE',
        priority: 220,
        maxConfidence: 'MEDIUM',
        evidenceTag: `SKILL_BALANCED|top=${coarsePercent(Math.round(topSkill.share * 100))}|skills=${studiedSkills.length}`,
        evidence: [
          {
            label: 'Largest share of study time',
            value: `${topSkill.name} at ${Math.round(topSkill.share * 100)}%`,
            source: 'STUDY_SESSIONS',
          },
          {
            label: 'Skills with recorded study time',
            value: `${studiedSkills.length}`,
            source: 'STUDY_SESSIONS',
          },
        ],
      }),
    )
  }

  // ── Recorded ability vs recent practice ───────────────────────────────────
  if (!assessment.recorded) {
    signals.push(
      makeSignal({
        id: 'assessment:missing',
        kind: 'NO_ASSESSMENT_DATA',
        type: 'SKILL',
        severity: 'INFO',
        priority: 900,
        maxConfidence: 'LOW',
        candidateEligible: false,
        evidenceTag: 'NO_ASSESSMENT_DATA|none',
        evidence: [
          {
            label: 'CEFR assessments recorded',
            value: '0',
            source: 'RECORDED_ASSESSMENT',
          },
        ],
      }),
    )
    notes.push(
      'No CEFR assessment is recorded. Nothing about your ability is inferred from study time — only what you record counts.',
    )
  } else {
    // `overall` is not a skill. A learner often records `overall C1` and `writing C1`
    // from the same report; letting `overall` anchor the comparison made writing
    // neither "highest" nor "lower", so the observation disappeared entirely. Only
    // skill dimensions are ranked, and every dimension sharing the top rank counts
    // as highest.
    const ranked = LEVEL_DIMENSIONS.filter(
      (dimension) => DIMENSION_SKILL_NAMES[dimension] !== undefined,
    )
      .map((dimension) => ({ dimension, level: assessment.levels[dimension] }))
      .filter(
        (entry): entry is { dimension: LevelDimension; level: CefrLevel } => entry.level !== null,
      )
      .map((entry) => ({ ...entry, rank: cefrRank(entry.level) }))
      .sort((a, b) => b.rank - a.rank || a.dimension.localeCompare(b.dimension))

    const topRank = ranked[0]?.rank
    const highest = ranked.find((entry) => entry.rank === topRank)

    if (ranked.length >= MIN_RECORDED_DIMENSIONS_TO_COMPARE) {
      for (const entry of ranked) {
        // Every entry here maps to a study skill; `overall` was filtered out above.
        const skill = findSkillForDimension(skills, entry.dimension)
        if (!skill) continue

        const gap = skill.lastPracticedDaysAgo
        if (gap === null || gap < 7) continue

        const isTop = topRank !== undefined && entry.rank === topRank

        if (isTop) {
          signals.push(
            makeSignal({
              id: `ability:strong-unpractised:${skill.id}`,
              kind: 'RECORDED_STRENGTH_UNPRACTISED',
              type: 'SKILL',
              severity: 'ATTENTION',
              // Ahead of the plain recency gap for the same skill: it carries both
              // facts (recorded level + practice gap), so one candidate per skill
              // keeps the more informative one.
              priority: 55,
              maxConfidence: 'MEDIUM',
              skillId: skill.id,
              facts: { level: entry.level, dimension: entry.dimension, daysSincePractice: gap },
              evidenceTag: `RECORDED_STRENGTH_UNPRACTISED|skill=${skill.id}|level=${entry.level}|days=${coarseDays(gap)}`,
              evidence: [
                {
                  label: `Recorded ${entry.dimension} level`,
                  value: `${entry.level} — the highest level you have recorded (${assessment.assessedOn ?? 'date not recorded'})`,
                  source: 'RECORDED_ASSESSMENT',
                },
                {
                  label: `Days since your last ${skill.name} session`,
                  value: `${gap}`,
                  source: 'STUDY_SESSIONS',
                },
              ],
            }),
          )
        } else if (topRank !== undefined) {
          signals.push(
            makeSignal({
              id: `ability:lower-recorded:${skill.id}`,
              kind: 'RECORDED_LEVEL_LOWER',
              type: 'SKILL',
              severity: 'ATTENTION',
              priority: 130,
              maxConfidence: 'MEDIUM',
              skillId: skill.id,
              facts: { level: entry.level, dimension: entry.dimension, daysSincePractice: gap },
              evidenceTag: `RECORDED_LEVEL_LOWER|skill=${skill.id}|level=${entry.level}|days=${coarseDays(gap)}`,
              evidence: [
                {
                  label: `Recorded ${entry.dimension} level`,
                  value: entry.level,
                  source: 'RECORDED_ASSESSMENT',
                },
                {
                  label: 'Your highest recorded level',
                  value: `${highest?.level ?? entry.level} (${highest?.dimension ?? entry.dimension})`,
                  source: 'RECORDED_ASSESSMENT',
                },
                {
                  label: `Days since your last ${skill.name} session`,
                  value: `${gap}`,
                  source: 'STUDY_SESSIONS',
                },
              ],
            }),
          )
        }
      }
    }
  }

  // ── Goals ─────────────────────────────────────────────────────────────────
  //
  // Completion is judged only when the goal has been running long enough to have a
  // history *and* the learner studied on enough of those days. Without the second
  // gate, three sessions in a fortnight look like evidence that a 60-minute target
  // is too large — which confuses not showing up with aiming too high.
  const attendedDays = activity.recent.activeDays
  const dailyGoal = goals.find((goal) => goal.period === 'DAILY')

  if (goalCompletion.dailyTargetMinutes === null) {
    notes.push('No daily goal is set, so goal completion could not be judged.')
  } else if (goalCompletion.trackedDays < GOAL_COMPLETION_MIN_DAYS) {
    notes.push(
      `Your daily goal has been running for ${goalCompletion.trackedDays} day${goalCompletion.trackedDays === 1 ? '' : 's'}, which is too short a history to judge completion.`,
    )
  } else if (attendedDays < GOAL_COMPLETION_MIN_ACTIVE_DAYS) {
    notes.push(
      `You studied on ${attendedDays} of the last ${goalCompletion.trackedDays} days. That is too few attempts to say whether the daily target is the right size, so completion is not judged.`,
    )
  } else if (goalCompletion.rate !== null) {
    if (goalCompletion.rate < GOAL_COMPLETION_FLOOR_PERCENT) {
      signals.push(
        makeSignal({
          id: 'goals:missed',
          kind: 'MISSED_GOALS',
          type: 'DURATION',
          severity: 'ATTENTION',
          priority: 50,
          maxConfidence: 'MEDIUM',
          ...(dailyGoal ? { goalId: dailyGoal.id } : {}),
          evidenceTag: `MISSED_GOALS|rate=${coarsePercent(goalCompletion.rate)}|target=${coarseMinutes(goalCompletion.dailyTargetMinutes)}`,
          evidence: [
            {
              label: `Days that met your ${minutesLabel(goalCompletion.dailyTargetMinutes)} daily goal`,
              value: `${goalCompletion.daysMeetingTarget} of ${goalCompletion.trackedDays}`,
              source: 'GOALS',
            },
            {
              label: 'Daily goal',
              value: minutesLabel(goalCompletion.dailyTargetMinutes),
              source: 'GOALS',
            },
          ],
        }),
      )
    } else if (goalCompletion.rate >= GOAL_COMPLETION_STRONG_PERCENT) {
      signals.push(
        makeSignal({
          id: 'goals:on-track',
          kind: 'GOALS_ON_TRACK',
          type: 'DURATION',
          severity: 'POSITIVE',
          priority: 230,
          maxConfidence: 'MEDIUM',
          ...(dailyGoal ? { goalId: dailyGoal.id } : {}),
          evidenceTag: `GOALS_ON_TRACK|rate=${coarsePercent(goalCompletion.rate)}`,
          evidence: [
            {
              label: `Days that met your ${minutesLabel(goalCompletion.dailyTargetMinutes)} daily goal`,
              value: `${goalCompletion.daysMeetingTarget} of ${goalCompletion.trackedDays}`,
              source: 'GOALS',
            },
          ],
        }),
      )
    }
  }

  // Two active goals of the same period with different targets cannot both be
  // the plan. Reporting the conflict is honest; picking a winner is the learner's
  // call, so the recommendation asks rather than decides.
  for (const period of ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const) {
    const samePeriod = goals.filter((goal) => goal.period === period)
    if (samePeriod.length < 2) continue

    const targets = [...new Set(samePeriod.map((goal) => goal.targetMinutes))]
    if (targets.length < 2) continue

    const first = samePeriod[0]
    const second = samePeriod[1]
    if (!first || !second) continue

    signals.push(
      makeSignal({
        id: `goals:conflict:${period}`,
        kind: 'CONFLICTING_GOALS',
        type: 'DURATION',
        severity: 'ATTENTION',
        priority: 120,
        maxConfidence: 'MEDIUM',
        goalId: first.id,
        evidenceTag: `CONFLICTING_GOALS|${period}|${targets.map((t) => coarseMinutes(t)).join(',')}`,
        evidence: [
          {
            label: `Active ${period.toLowerCase()} goals`,
            value: `${samePeriod.length}`,
            source: 'GOALS',
          },
          {
            label: 'Their targets',
            value: targets.map((target) => minutesLabel(target)).join(' / '),
            source: 'GOALS',
          },
        ],
      }),
    )
  }

  // ── Duration pattern ──────────────────────────────────────────────────────
  const medianMinutes = activity.medianSessionMinutes
  if (sessionCount >= MIN_SESSIONS_FOR_PATTERN && medianMinutes !== null) {
    const short = medianMinutes < SHORT_SESSION_MEDIAN_MINUTES
    const long = medianMinutes >= LONG_SESSION_MEDIAN_MINUTES

    if (short || long) {
      signals.push(
        makeSignal({
          id: 'duration:pattern',
          kind: 'DURATION_PATTERN',
          type: 'DURATION',
          severity: 'INFO',
          priority: 110,
          maxConfidence: 'MEDIUM',
          evidenceTag: `DURATION_PATTERN|median=${coarseMinutes(medianMinutes)}`,
          evidence: [
            {
              label: 'Median session length',
              value: minutesLabel(medianMinutes),
              source: 'STUDY_SESSIONS',
            },
            {
              label: 'Average session length',
              value:
                activity.averageSessionMinutes === null
                  ? 'not available'
                  : minutesLabel(activity.averageSessionMinutes),
              source: 'STUDY_SESSIONS',
            },
            {
              label: 'Sessions recorded',
              value: `${sessionCount}`,
              source: 'STUDY_SESSIONS',
            },
          ],
        }),
      )
    }
  }

  // ── Exams ─────────────────────────────────────────────────────────────────
  //
  // When the active objective is an exam objective, only exams of that type are
  // in scope. This is what makes an IELTS → TOEFL switch change the advice instead
  // of leaving yesterday's exam in charge of today's preparation.
  const objectiveExamType =
    objective !== null && (objective.type === 'IELTS' || objective.type === 'TOEFL')
      ? objective.type
      : null

  const scopedExams =
    objectiveExamType === null ? exams : exams.filter((exam) => exam.type === objectiveExamType)

  const upcoming = scopedExams
    .filter((exam) => exam.daysUntil !== null && exam.daysUntil <= UPCOMING_EXAM_DAYS)
    .sort((a, b) => (a.daysUntil ?? 0) - (b.daysUntil ?? 0))

  for (const exam of upcoming) {
    const days = exam.daysUntil as number
    signals.push(
      makeSignal({
        id: `exam:upcoming:${exam.id}`,
        kind: 'UPCOMING_EXAM',
        type: 'EXAM_PREPARATION',
        severity: 'ATTENTION',
        priority: 10,
        maxConfidence: 'HIGH',
        examId: exam.id,
        evidenceTag: `UPCOMING_EXAM|${exam.type}|days=${coarseDays(days)}`,
        evidence: [
          { label: 'Exam type', value: exam.type, source: 'OBJECTIVE' },
          { label: 'Days until the exam date', value: `${days}`, source: 'OBJECTIVE' },
          ...(exam.targetScore === null
            ? []
            : [
                {
                  label: 'Target score you set',
                  value: `${exam.targetScore}`,
                  source: 'OBJECTIVE' as const,
                },
              ]),
        ],
      }),
    )

    const stale =
      exam.latestResult === null ||
      (exam.latestResult.takenDaysAgo >= 0 &&
        exam.latestResult.takenDaysAgo > STALE_EXAM_RESULT_DAYS)

    if (stale) {
      signals.push(
        makeSignal({
          id: `exam:no-recent-result:${exam.id}`,
          kind: 'EXAM_WITHOUT_RECENT_RESULT',
          type: 'EXAM_PREPARATION',
          severity: 'ATTENTION',
          priority: 20,
          maxConfidence: 'MEDIUM',
          examId: exam.id,
          evidenceTag: `EXAM_WITHOUT_RECENT_RESULT|${exam.id}|${exam.latestResult === null ? 'none' : coarseDays(exam.latestResult.takenDaysAgo)}`,
          evidence: [
            {
              label: 'Recorded results for this exam',
              value:
                exam.latestResult === null
                  ? 'none'
                  : `last recorded ${exam.latestResult.takenDaysAgo} days ago`,
              source: 'RECORDED_EXAM_RESULT',
            },
            {
              label: 'Days until the exam date',
              value: `${days}`,
              source: 'OBJECTIVE',
            },
          ],
        }),
      )
    }

    if (
      exam.targetScore !== null &&
      exam.latestResult?.overallScore !== null &&
      exam.latestResult
    ) {
      signals.push(
        makeSignal({
          id: `exam:score-vs-target:${exam.id}`,
          kind: 'RECORDED_SCORE_VS_TARGET',
          type: 'EXAM_PREPARATION',
          severity: 'INFO',
          priority: 140,
          maxConfidence: 'MEDIUM',
          examId: exam.id,
          evidenceTag: `RECORDED_SCORE_VS_TARGET|${exam.id}|target=${exam.targetScore}|last=${exam.latestResult.overallScore}`,
          evidence: [
            {
              label: 'Target score you set',
              value: `${exam.targetScore}`,
              source: 'OBJECTIVE',
            },
            {
              label: 'Latest overall score you recorded',
              value: `${exam.latestResult.overallScore}`,
              source: 'RECORDED_EXAM_RESULT',
            },
          ],
        }),
      )
    }
  }

  // An exam further out than the countdown still decides what the next months are
  // for. Without this, a learner four months from an IELTS date received no
  // exam-shaped advice at all: the countdown starts at 60 days, and the objective's
  // own target date was carried in the context but never reasoned about.
  const horizonExams = scopedExams
    .filter(
      (exam) =>
        exam.daysUntil !== null &&
        exam.daysUntil > UPCOMING_EXAM_DAYS &&
        exam.daysUntil <= EXAM_HORIZON_DAYS,
    )
    .sort((a, b) => (a.daysUntil ?? 0) - (b.daysUntil ?? 0))

  for (const exam of horizonExams) {
    const days = exam.daysUntil as number
    const hasRecentResult =
      exam.latestResult !== null && exam.latestResult.takenDaysAgo <= STALE_EXAM_RESULT_DAYS
    const baseline = hasRecentResult ? 'result' : assessment.recorded ? 'assessment' : 'none'
    const baselineSource =
      baseline === 'result' ? ('RECORDED_EXAM_RESULT' as const) : ('RECORDED_ASSESSMENT' as const)
    const plan = plans[0]

    signals.push(
      makeSignal({
        id: `exam:horizon:${exam.id}`,
        kind: 'EXAM_HORIZON',
        type: 'EXAM_PREPARATION',
        // A missing baseline is actionable; an exam that already has measurements
        // is context, and context does not earn a slot ahead of real observations.
        severity: baseline === 'none' ? 'ATTENTION' : 'INFO',
        priority: 18,
        maxConfidence: 'MEDIUM',
        examId: exam.id,
        facts: {
          daysUntil: days,
          examType: exam.type,
          baseline,
          ...(plan ? { planDaysLeft: plan.remainingDays } : {}),
        },
        evidenceTag: `EXAM_HORIZON|${exam.type}|days=${coarseDays(days)}|baseline=${baseline}`,
        evidence: [
          { label: 'Exam type', value: exam.type, source: 'OBJECTIVE' },
          { label: 'Days until the exam date', value: `${days}`, source: 'OBJECTIVE' },
          ...(objective === null || objective.targetDate === null
            ? []
            : [
                {
                  label: 'Objective target date',
                  value: objective.targetDate,
                  source: 'OBJECTIVE' as const,
                },
              ]),
          ...(plan
            ? [
                {
                  label: 'Days left in your active plan',
                  value: `${plan.remainingDays}`,
                  source: 'PLANS' as const,
                },
              ]
            : []),
          {
            label: 'Baseline on file',
            value:
              baseline === 'result'
                ? `a result recorded ${exam.latestResult?.takenDaysAgo ?? 0} days ago`
                : baseline === 'assessment'
                  ? `a level recorded ${assessment.assessedOn ?? 'with no date'}`
                  : 'none recorded',
            source: baselineSource,
          },
        ],
      }),
    )
  }

  if (objectiveExamType !== null && objective) {
    const matchingExam = scopedExams.some((exam) => exam.status !== 'CANCELLED')
    if (!matchingExam) {
      signals.push(
        makeSignal({
          id: `exam:missing-for-objective:${objective.type}`,
          kind: 'EXAM_MISSING_FOR_OBJECTIVE',
          type: 'EXAM_PREPARATION',
          severity: 'ATTENTION',
          priority: 25,
          maxConfidence: 'MEDIUM',
          evidenceTag: `EXAM_MISSING_FOR_OBJECTIVE|${objective.type}`,
          evidence: [
            { label: 'Active objective', value: objective.type, source: 'OBJECTIVE' },
            {
              label: `${objective.type} exams recorded`,
              value: '0',
              source: 'OBJECTIVE',
            },
          ],
        }),
      )
    }
  }

  // ── Plans ─────────────────────────────────────────────────────────────────
  for (const plan of plans) {
    const sustainablePace = plan.requiredDailyMinutes <= MAX_REALISTIC_DAILY_MINUTES

    // A plan that has already run out of days has no pace left to recommend: the
    // required-minutes arithmetic divides by a floor of one day and produces a
    // number nobody could act on. A pace above the sustainability threshold is the
    // unrealistic-pace signal's job, so it is not repeated here — two candidates
    // for one plan contradicted each other ("add 240 min/day" next to "240 min/day
    // is not realistic").
    if (plan.paceStatus === 'behind' && plan.remainingDays > 0 && sustainablePace) {
      signals.push(
        makeSignal({
          id: `plan:behind:${plan.id}`,
          kind: 'PLAN_BEHIND',
          type: 'PLAN_ADJUSTMENT',
          severity: 'ATTENTION',
          priority: 90,
          maxConfidence: 'MEDIUM',
          planId: plan.id,
          evidenceTag: `PLAN_BEHIND|${plan.id}|study=${coarsePercent(plan.studyProgressPercent)}|time=${coarsePercent(plan.timeProgressPercent)}`,
          evidence: [
            {
              label: 'Study progress towards the plan target',
              value: `${plan.studyProgressPercent}% (${minutesLabel(plan.actualMinutes)} of ${minutesLabel(plan.targetMinutes)})`,
              source: 'PLANS',
            },
            {
              label: 'Calendar time elapsed',
              value: `${plan.timeProgressPercent}%`,
              source: 'PLANS',
            },
            {
              label: 'Days left in the plan',
              value: `${plan.remainingDays}`,
              source: 'PLANS',
            },
          ],
        }),
      )
    }

    if (plan.requiredDailyMinutes > MAX_REALISTIC_DAILY_MINUTES && plan.remainingDays > 0) {
      signals.push(
        makeSignal({
          id: `plan:pace:${plan.id}`,
          kind: 'PLAN_UNREALISTIC_PACE',
          type: 'PLAN_ADJUSTMENT',
          severity: 'ATTENTION',
          priority: 100,
          maxConfidence: 'MEDIUM',
          planId: plan.id,
          evidenceTag: `PLAN_UNREALISTIC_PACE|${plan.id}|required=${coarseMinutes(plan.requiredDailyMinutes)}`,
          evidence: [
            {
              label: 'Study progress towards the plan target',
              value: `${plan.studyProgressPercent}% (${minutesLabel(plan.actualMinutes)} of ${minutesLabel(plan.targetMinutes)})`,
              source: 'PLANS',
            },
            {
              label: 'Calendar time elapsed',
              value: `${plan.timeProgressPercent}%`,
              source: 'PLANS',
            },
            {
              label: 'Minutes per day needed to hit the plan target',
              value: `${plan.requiredDailyMinutes}`,
              source: 'PLANS',
            },
            {
              label: 'Days left in the plan',
              value: `${plan.remainingDays}`,
              source: 'PLANS',
            },
            {
              label: 'Minutes still needed',
              value: minutesLabel(Math.max(0, plan.targetMinutes - plan.actualMinutes)),
              source: 'PLANS',
            },
          ],
        }),
      )
    }
  }

  // ── Objective ─────────────────────────────────────────────────────────────
  if (objective === null) {
    signals.push(
      makeSignal({
        id: 'objective:missing',
        kind: 'OBJECTIVE_MISSING',
        type: 'EXAM_PREPARATION',
        severity: 'INFO',
        priority: 950,
        maxConfidence: 'LOW',
        candidateEligible: false,
        evidenceTag: `OBJECTIVE_MISSING|${context.hasAnyObjective ? 'none-set' : 'none-created'}`,
        evidence: [
          {
            label: 'Active objective',
            value: context.hasAnyObjective ? 'none set' : 'none created',
            source: 'OBJECTIVE',
          },
        ],
      }),
    )
    notes.push(
      context.hasAnyObjective
        ? 'No objective is set as active, so exam preparation is not anchored to anything.'
        : 'No learning objective exists yet, so there is no target date or score to plan against.',
    )
  }

  if (!hasExamResult) {
    notes.push('No exam result is recorded, so no score is estimated or predicted anywhere here.')
  }

  signals.sort((a, b) => {
    const severityOrder: Record<SignalSeverity, number> = {
      ATTENTION: 0,
      POSITIVE: 1,
      INFO: 2,
    }
    return (
      severityOrder[a.severity] - severityOrder[b.severity] ||
      a.priority - b.priority ||
      a.id.localeCompare(b.id)
    )
  })

  const ceiling = resolveConfidenceCeiling({
    sessionCount,
    activeDays: activity.lifetime.activeDays,
    hasAssessment: assessment.recorded,
    hasExamResult,
  })

  return {
    signals,
    dataQuality: {
      level: ceiling.level,
      sessionCount,
      activeDays: activity.lifetime.activeDays,
      assessmentRecorded: assessment.recorded,
      examResultRecorded: hasExamResult,
      notes,
    },
    confidenceCeiling: ceiling.level,
    ceilingRationale: ceiling.rationale,
  }
}
