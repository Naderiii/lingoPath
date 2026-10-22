/**
 * Candidate generation — the recommendation step before any language model is
 * involved (Phase 10).
 *
 * Two jobs, both deterministic:
 *
 * 1. **Turn signals into advice.** Each eligible signal becomes at most one
 *    candidate: a title, the recommendation itself, the rationale, the facts it
 *    rests on, a confidence band and an optional concrete action.
 * 2. **Honour what the learner already said.** Feedback is applied here rather
 *    than after generation, so a recommendation the learner rejected twice does
 *    not get regenerated and re-phrased into something that looks new.
 *
 * Wording rules that the built-in strings follow, and that the LLM path is
 * validated against separately:
 *
 * - A practice fact is described as practice ("your last writing session was 18
 *   days ago"), never as ability.
 * - An ability statement quotes a recorded assessment or exam result and says so.
 * - Nothing is called weak, poor, bad or failing. No score is predicted.
 * - Every rationale names the comparison it made, so the learner can disagree
 *   with the reasoning instead of only with the conclusion.
 */

import type {
  RecommendationDataPoint,
  RecommendationType,
  SuggestedGoalAction,
} from '@lingopath/types'
import type { ConfidenceLevel, RecommendationContext } from './recommendation.context.js'
import {
  MAX_REALISTIC_DAILY_MINUTES,
  minConfidence,
  SHORT_SESSION_MEDIAN_MINUTES,
  type RecommendationSignal,
} from './recommendation.analysis.js'

export interface CandidateRecommendation {
  /** Stable id, re-used by the LLM to refer to this candidate. */
  candidateId: string
  type: RecommendationType
  title: string
  recommendation: string
  rationale: string
  supportingData: RecommendationDataPoint[]
  confidence: ConfidenceLevel
  estimatedDurationMinutes: number | null
  relatedSkillId: string | null
  relatedGoalId: string | null
  relatedPlanId: string | null
  /** Coarse fingerprint of the evidence; see `recommendation.analysis.ts`. */
  evidenceKey: string
  signalIds: string[]
  suggestedAction: SuggestedGoalAction | null
  severity: RecommendationSignal['severity']
  priority: number
}

export type SuppressionReason = 'REPEATED_REJECTION' | 'POSTPONED'

export interface SuppressedCandidate {
  candidateId: string
  reason: SuppressionReason
}

export interface FeedbackApplication {
  candidates: CandidateRecommendation[]
  suppressed: SuppressedCandidate[]
  /** Candidates whose band was lowered because the learner rejected them once. */
  confidenceAdjusted: number
}

/** A rejection this recent is remembered as "not now" rather than "never". */
export const POSTPONE_WINDOW_DAYS = 7
/** This many rejections of identical evidence stops the repeat. */
export const REPEATED_REJECTION_THRESHOLD = 2

/**
 * Only an explicit "no" counts.
 *
 * `IGNORED` means the learner never saw the item — the history view labels it "Not
 * seen". Counting it as a rejection let two unseen rows silence an observation
 * permanently, which is the opposite of what the learner said (nothing).
 */
const REJECTION_ACTIONS = new Set(['REJECTED'])

function minutesLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest} min`
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function roundTo5(value: number): number {
  return Math.round(value / 5) * 5
}

/** The block length to suggest: the learner's own median, kept within a sane range. */
function suggestedBlockMinutes(context: RecommendationContext): number {
  const median = context.activity.medianSessionMinutes
  if (median === null) return 30
  return clamp(roundTo5(median), 15, 90)
}

/**
 * A target that is missed most days is probably too large. The proposal keeps the
 * learner's own rate of meeting it and never drops below a five-minute block, so
 * the suggestion stays recognisably their goal rather than a new one.
 *
 * `achievedDailyMinutes` is what the learner actually averages on the days they do
 * study. Without it the proposal came from the hit rate alone: fourteen days of 59
 * minutes against a 60-minute target is a 0% rate, and the engine proposed 20
 * minutes to someone who was one minute short every day. The proposal therefore
 * starts from the larger of the two and stays strictly below the current target.
 */
export function proposeLowerDailyTarget(
  target: number,
  ratePercent: number,
  achievedDailyMinutes = 0,
): number {
  if (target <= 0) return 10
  const basis = Math.max((target * Math.max(ratePercent, 20)) / 100, achievedDailyMinutes)
  const scaled = roundTo5(basis)
  return Math.max(5, Math.min(scaled, target - 5))
}

function goalForSkill(context: RecommendationContext, skillId: string): string | null {
  const goal = context.goals.find((entry) =>
    entry.skillTargets.some((target) => target.skillId === skillId),
  )
  return goal?.id ?? null
}

function planForSkill(context: RecommendationContext, skillId: string): string | null {
  const plan = context.plans.find((entry) => entry.currentMilestone?.skillId === skillId)
  return plan?.id ?? null
}

function buildEvidenceKey(
  type: RecommendationType,
  skillId: string | null,
  signal: RecommendationSignal,
): string {
  return `${type}|${skillId ?? '-'}|${signal.evidenceTag}`
}

function weeklyGoalAction(
  skillId: string | null,
  minutesPerWeek: number,
  relatedGoalId: string | null,
): SuggestedGoalAction {
  return {
    kind: 'CREATE_GOAL',
    period: 'WEEKLY',
    targetMinutes: clamp(roundTo5(minutesPerWeek), 15, 10080),
    skillId,
    relatedGoalId,
  }
}

// ─── Per-signal builders ─────────────────────────────────────────────────────

interface BuildInput {
  signal: RecommendationSignal
  context: RecommendationContext
  /** Confidence after the global ceiling has been applied. */
  confidence: ConfidenceLevel
}

function buildFromSignal(input: BuildInput): CandidateRecommendation | null {
  const { signal, context, confidence } = input
  const skill = signal.skillId ? context.skills.find((entry) => entry.id === signal.skillId) : null
  const block = suggestedBlockMinutes(context)

  const finish = (
    candidate: Omit<
      CandidateRecommendation,
      'candidateId' | 'evidenceKey' | 'signalIds' | 'severity' | 'priority' | 'confidence'
    > & { confidence?: ConfidenceLevel },
  ): CandidateRecommendation => ({
    ...candidate,
    candidateId: signal.id,
    confidence: candidate.confidence ?? confidence,
    evidenceKey: buildEvidenceKey(signal.type, signal.skillId ?? null, signal),
    signalIds: [signal.id],
    severity: signal.severity,
    priority: signal.priority,
  })

  switch (signal.kind) {
    case 'ZERO_STUDY_HISTORY':
      return finish({
        type: 'CONSISTENCY',
        title: 'Start your study record',
        recommendation:
          'Log your first study session — 15 minutes is enough. Progress, streaks and balance are all derived from sessions, so nothing can be measured until one exists.',
        rationale:
          'No sessions are recorded yet, so there is no practice evidence to reason from. This is a request for data, not an assessment of how you study.',
        supportingData: signal.evidence,
        estimatedDurationMinutes: 15,
        relatedSkillId: null,
        relatedGoalId: null,
        relatedPlanId: null,
        suggestedAction: null,
      })

    case 'INSUFFICIENT_HISTORY':
      return finish({
        type: 'CONSISTENCY',
        title: 'Build a little more history first',
        recommendation: `Log a few more sessions before acting on patterns. With ${context.activity.lifetime.sessions} recorded sessions, anything visible here describes a moment rather than a habit.`,
        rationale:
          'Recommendations are only as strong as the history behind them. A handful of sessions shows what you did once; it cannot show what you tend to do.',
        supportingData: signal.evidence,
        estimatedDurationMinutes: block,
        relatedSkillId: null,
        relatedGoalId: null,
        relatedPlanId: null,
        suggestedAction: null,
      })

    case 'WEAK_CONSISTENCY': {
      const gap = context.activity.lastSessionDaysAgo
      return finish({
        type: 'CONSISTENCY',
        title: 'Rebuild a steady rhythm',
        recommendation:
          gap === null
            ? 'Book two short sessions this week — 20 minutes each is enough — so there is a schedule to measure.'
            : `Book two short sessions this week — 20 minutes each is enough — to break the ${gap}-day gap since your last one.`,
        rationale:
          'This compares when you last studied with how many days in the recent window had any study time. It is a statement about your schedule, not about your ability.',
        supportingData: signal.evidence,
        estimatedDurationMinutes: 20,
        relatedSkillId: null,
        relatedGoalId: null,
        relatedPlanId: null,
        suggestedAction: weeklyGoalAction(null, 40, null),
      })
    }

    case 'RECENT_PRACTICE_LOW':
      return finish({
        type: 'CONSISTENCY',
        title: 'Your recent study time dropped',
        recommendation: `The last ${context.activity.recent.days} days hold ${minutesLabel(context.activity.recent.minutes)} of study time against ${minutesLabel(context.activity.prior.minutes)} in the ${context.activity.prior.days} days before. One ${block}-minute session this week would stop the slide.`,
        rationale:
          'Study time fell by more than half between two equal windows. This compares practice volume only — it says nothing about how well you can do anything.',
        supportingData: signal.evidence,
        estimatedDurationMinutes: block,
        relatedSkillId: null,
        relatedGoalId: null,
        relatedPlanId: null,
        suggestedAction: weeklyGoalAction(null, block * 2, null),
      })

    case 'STRONG_CONSISTENCY':
      return finish({
        type: 'CONSISTENCY',
        title: 'Keep the streak intact',
        recommendation: `You are on a ${context.activity.currentStreak}-day streak, with study time on ${context.activity.recent.activeDays} of the last ${context.activity.recent.days} days. Protect it with one session on your next available day.`,
        rationale:
          'Consistency is the clearest thing your sessions show right now. The suggestion is to avoid breaking a run that is already working, not to increase it.',
        supportingData: signal.evidence,
        estimatedDurationMinutes: block,
        relatedSkillId: null,
        relatedGoalId: null,
        relatedPlanId: null,
        suggestedAction: null,
      })

    case 'SKILL_NOT_PRACTICED': {
      if (!skill) return null
      const days = skill.lastPracticedDaysAgo ?? 0
      return finish({
        type: 'SKILL',
        title: `Practise ${skill.name} again`,
        recommendation: `Your last ${skill.name.toLowerCase()} session was ${days} days ago, and ${skill.name.toLowerCase()} holds ${Math.round(skill.share * 100)}% of your recorded study time. Add one ${block}-minute ${skill.name.toLowerCase()} session this week.`,
        rationale:
          'This compares when you last practised the skill with how your recorded time is distributed. It is a schedule observation, not an assessment of your level.',
        supportingData: signal.evidence,
        estimatedDurationMinutes: block,
        relatedSkillId: skill.id,
        relatedGoalId: goalForSkill(context, skill.id),
        relatedPlanId: planForSkill(context, skill.id),
        suggestedAction: weeklyGoalAction(skill.id, block * 2, goalForSkill(context, skill.id)),
      })
    }

    case 'SKILL_LOW_SHARE': {
      if (!skill) return null
      const top = [...context.skills]
        .filter((entry) => entry.totalMinutes > 0)
        .sort((a, b) => b.share - a.share)[0]
      return finish({
        type: 'BALANCE',
        title: `Rebalance towards ${skill.name}`,
        recommendation: `${top ? `${top.name} takes ${Math.round(top.share * 100)}% of your study time` : 'Your study time is concentrated in one skill'}, while ${skill.name.toLowerCase()} takes ${Math.round(skill.share * 100)}%. Give ${skill.name.toLowerCase()} one ${block}-minute session this week to even the split.`,
        rationale:
          'The imbalance is in recorded minutes, which is a fact about your schedule. It does not say the skill you practise less is the one you are worse at.',
        supportingData: signal.evidence,
        estimatedDurationMinutes: block,
        relatedSkillId: skill.id,
        relatedGoalId: goalForSkill(context, skill.id),
        relatedPlanId: planForSkill(context, skill.id),
        suggestedAction: weeklyGoalAction(skill.id, block, goalForSkill(context, skill.id)),
      })
    }

    case 'SKILL_CONCENTRATED': {
      const studied = context.skills.filter((entry) => entry.totalMinutes > 0)
      const top = [...studied].sort((a, b) => b.share - a.share)[0]
      const percent = Math.round((top?.share ?? 0) * 100)
      const name = top?.name ?? 'One skill'
      return finish({
        type: 'BALANCE',
        title: `${name} holds ${percent}% of your study time`,
        recommendation: `${name} accounts for ${percent}% of the minutes you have recorded${studied.length <= 1 ? ', and nothing else has been logged yet' : ''}. That is where your practice has gone; if another skill matters for your current goal, one ${block}-minute session there is enough to change the split.`,
        rationale:
          'Measured in recorded minutes only. This says where your time went; it does not grade the skills that received less of it, and no level is inferred from any of them.',
        supportingData: signal.evidence,
        estimatedDurationMinutes: block,
        relatedSkillId: null,
        relatedGoalId: null,
        relatedPlanId: null,
        suggestedAction: null,
      })
    }

    case 'SKILL_PRACTICE_DROPPED': {
      if (!skill) return null
      const recordedLevel = signal.facts?.['level']
      const recent = Number(signal.facts?.['recentMinutes'] ?? skill.recentMinutes)
      const prior = Number(signal.facts?.['priorMinutes'] ?? skill.priorMinutes)
      const levelNote =
        recordedLevel === undefined
          ? ''
          : ` Your recorded ${skill.name.toLowerCase()} level is ${recordedLevel}; that recording has not changed.`
      return finish({
        type: 'SKILL',
        title: `${skill.name} practice dropped in the last ${context.activity.recent.days} days`,
        recommendation: `You recorded ${minutesLabel(recent)} of ${skill.name.toLowerCase()} practice in the last ${context.activity.recent.days} days, against ${minutesLabel(prior)} in the ${context.activity.prior.days} days before.${levelNote} One ${block}-minute ${skill.name.toLowerCase()} session this week restores the earlier cadence.`,
        rationale:
          'This compares minutes practised in two equal windows. Practice volume and recorded ability are separate facts: a quieter fortnight is a frequency observation, not a lower level.',
        supportingData: signal.evidence,
        estimatedDurationMinutes: block,
        relatedSkillId: skill.id,
        relatedGoalId: goalForSkill(context, skill.id),
        relatedPlanId: planForSkill(context, skill.id),
        suggestedAction: weeklyGoalAction(skill.id, block * 2, goalForSkill(context, skill.id)),
      })
    }

    case 'SKILL_BALANCED': {
      const top = [...context.skills].sort((a, b) => b.share - a.share)[0]
      return finish({
        type: 'BALANCE',
        title: 'Your study time is spread evenly',
        recommendation: `No skill takes more than ${top ? Math.round(top.share * 100) : 0}% of your recorded time. Keep the current split and revisit it when a new objective starts.`,
        rationale:
          'Even distribution across the skills you actually study, measured in recorded minutes. Nothing here is inferred about the level you have reached in any of them.',
        supportingData: signal.evidence,
        estimatedDurationMinutes: null,
        relatedSkillId: null,
        relatedGoalId: null,
        relatedPlanId: null,
        suggestedAction: null,
      })
    }

    case 'RECORDED_STRENGTH_UNPRACTISED': {
      if (!skill) return null
      const recordedLevel = signal.facts?.['level'] ?? 'recorded'
      const days = skill.lastPracticedDaysAgo ?? 0
      return finish({
        type: 'SKILL',
        title: `${skill.name} is your highest recorded level, and practice has paused`,
        recommendation: `Your latest recorded ${skill.name.toLowerCase()} level is ${recordedLevel}, the highest you have recorded — but your last ${skill.name.toLowerCase()} session was ${days} days ago. Add one ${block}-minute session this week.`,
        rationale:
          'Recorded assessment data and recent practice are two different facts: the level is what you recorded, the gap is what your sessions show. Neither is being reinterpreted as the other, and no weakness is being claimed.',
        supportingData: signal.evidence,
        estimatedDurationMinutes: block,
        relatedSkillId: skill.id,
        relatedGoalId: goalForSkill(context, skill.id),
        relatedPlanId: planForSkill(context, skill.id),
        suggestedAction: weeklyGoalAction(skill.id, block * 2, goalForSkill(context, skill.id)),
      })
    }

    case 'RECORDED_LEVEL_LOWER': {
      if (!skill) return null
      const days = skill.lastPracticedDaysAgo ?? 0
      return finish({
        type: 'SKILL',
        title: `Practise ${skill.name}: recorded below your highest dimension`,
        recommendation: `Your recorded ${skill.name.toLowerCase()} level sits below your highest recorded level, and you have not practised ${skill.name.toLowerCase()} for ${days} days. One ${block}-minute session this week would put the two facts back in the same picture.`,
        rationale:
          'Both levels are ones you recorded; the comparison is arithmetic on those recordings. It is paired with the practice gap rather than turned into a verdict about your ability.',
        supportingData: signal.evidence,
        estimatedDurationMinutes: block,
        relatedSkillId: skill.id,
        relatedGoalId: goalForSkill(context, skill.id),
        relatedPlanId: planForSkill(context, skill.id),
        suggestedAction: weeklyGoalAction(skill.id, block * 2, goalForSkill(context, skill.id)),
      })
    }

    case 'MISSED_GOALS': {
      const target = context.goalCompletion.dailyTargetMinutes ?? 0
      const rate = context.goalCompletion.rate ?? 0
      const achieved = context.goalCompletion.averageActiveDayMinutes
      const proposed = proposeLowerDailyTarget(target, rate, achieved)
      const achievedNote =
        achieved > 0 ? `, at about ${minutesLabel(achieved)} on the days you did study` : ''
      return finish({
        type: 'DURATION',
        title: 'Set a daily target you can actually hit',
        recommendation: `Your daily goal is ${minutesLabel(target)} and ${context.goalCompletion.daysMeetingTarget} of the last ${context.goalCompletion.trackedDays} days met it${achievedNote}. Try ${minutesLabel(proposed)} for two weeks, then raise it again once it is being met.`,
        rationale:
          'A target missed most days is a calibration problem before it is a discipline problem. A smaller target that is met tells you more than a large one that is not.',
        supportingData: signal.evidence,
        estimatedDurationMinutes: proposed,
        relatedSkillId: null,
        relatedGoalId: signal.goalId ?? null,
        relatedPlanId: null,
        suggestedAction: {
          kind: 'CREATE_GOAL',
          period: 'DAILY',
          targetMinutes: proposed,
          skillId: null,
          relatedGoalId: signal.goalId ?? null,
        },
      })
    }

    case 'GOALS_ON_TRACK':
      return finish({
        type: 'DURATION',
        title: 'Your daily target is working',
        recommendation: `${context.goalCompletion.daysMeetingTarget} of the last ${context.goalCompletion.trackedDays} days met your daily goal. Hold the target as it is, and revisit it when your objective changes.`,
        rationale:
          'The target is being met at its current size, so changing it now would trade a working calibration for an untested one.',
        supportingData: signal.evidence,
        estimatedDurationMinutes: context.goalCompletion.dailyTargetMinutes,
        relatedSkillId: null,
        relatedGoalId: signal.goalId ?? null,
        relatedPlanId: null,
        suggestedAction: null,
      })

    case 'CONFLICTING_GOALS': {
      const period = signal.id.split(':').pop() ?? 'DAILY'
      const samePeriod = context.goals.filter((goal) => goal.period === period)
      const targets = [...new Set(samePeriod.map((goal) => goal.targetMinutes))]
      return finish({
        type: 'DURATION',
        title: `Two ${period.toLowerCase()} targets are active at once`,
        recommendation: `You have ${samePeriod.length} active ${period.toLowerCase()} goals with different targets (${targets.map(minutesLabel).join(' / ')}). Keep one active and set the others inactive, so progress has a single definition.`,
        rationale:
          'Two different targets for the same period cannot both be met, and their progress numbers will always disagree. The conflict is reported rather than resolved, because which target to keep is your decision.',
        supportingData: signal.evidence,
        estimatedDurationMinutes: null,
        relatedSkillId: null,
        relatedGoalId: signal.goalId ?? null,
        relatedPlanId: null,
        suggestedAction: null,
      })
    }

    case 'DURATION_PATTERN': {
      const median = context.activity.medianSessionMinutes ?? block
      const short = median < SHORT_SESSION_MEDIAN_MINUTES
      return finish({
        type: 'DURATION',
        title: short
          ? 'Your sessions are short — try one longer block'
          : 'Your sessions are long — consider splitting them',
        recommendation: short
          ? `Your median session is ${minutesLabel(median)}. Try one ${clamp(median * 2, 30, 90)}-minute block this week and see whether it fits your day.`
          : `Your median session is ${minutesLabel(median)}. Split one of them into two ${Math.max(10, Math.round(median / 2))}-minute blocks and see whether the time is easier to place.`,
        rationale:
          'Median session length describes the sessions you logged. It is a starting point for a schedule experiment, not a rule about how you should study.',
        supportingData: signal.evidence,
        estimatedDurationMinutes: short
          ? clamp(median * 2, 30, 90)
          : Math.max(10, Math.round(median / 2)),
        relatedSkillId: null,
        relatedGoalId: null,
        relatedPlanId: null,
        suggestedAction: null,
      })
    }

    case 'UPCOMING_EXAM': {
      const exam = context.exams.find((entry) => entry.id === signal.examId)
      const days = exam?.daysUntil ?? null
      return finish({
        type: 'EXAM_PREPARATION',
        title:
          days === null
            ? 'Plan the run-up to your exam'
            : `${days} days until your ${exam?.type ?? 'exam'}`,
        recommendation:
          days === null
            ? 'Plan the next two weeks around the sections you can still move, and log each timed section you complete.'
            : `With ${days} days left, plan the next two weeks around the sections you can still move: one timed section per week, logged like any other session.`,
        rationale:
          'The day count comes from the exam date you recorded. It says how much calendar time is left, not how ready you are — readiness is not something this engine predicts.',
        supportingData: signal.evidence,
        estimatedDurationMinutes: 60,
        relatedSkillId: null,
        relatedGoalId: null,
        relatedPlanId: null,
        suggestedAction: null,
      })
    }

    case 'EXAM_WITHOUT_RECENT_RESULT': {
      const exam = context.exams.find((entry) => entry.id === signal.examId)
      return finish({
        type: 'EXAM_PREPARATION',
        title: 'Record a mock result before the exam',
        recommendation: `Your ${exam?.type ?? 'exam'} exam is ${exam?.daysUntil ?? 0} days away and no result has been recorded recently. Take one timed section and record the score, mock or real.`,
        rationale:
          'Recorded results are the only score evidence this app uses. Without one, the only thing that can be said about exam preparation is how much time is left.',
        supportingData: signal.evidence,
        estimatedDurationMinutes: 60,
        relatedSkillId: null,
        relatedGoalId: null,
        relatedPlanId: null,
        suggestedAction: null,
      })
    }

    case 'EXAM_HORIZON': {
      const exam = context.exams.find((entry) => entry.id === signal.examId)
      const days = exam?.daysUntil ?? null
      if (days === null) return null
      const examType = exam?.type ?? context.objective?.type ?? 'exam'
      const baseline = signal.facts?.['baseline'] ?? 'none'
      const planDays = signal.facts?.['planDaysLeft']
      const planNote =
        typeof planDays === 'number'
          ? ` Your active plan has ${planDays} day${planDays === 1 ? '' : 's'} left.`
          : ''

      if (baseline === 'none') {
        return finish({
          type: 'EXAM_PREPARATION',
          title: `${days} days until your ${examType}: record a baseline`,
          recommendation: `Your ${examType} exam is ${days} days away and no assessment or mock result is on file.${planNote} Book one timed section in the next two weeks and record the result, so the months ahead can be planned against something measured.`,
          rationale:
            'The day count comes from the exam date you recorded, and the request is for a measurement. No score, band or readiness estimate is made here.',
          supportingData: signal.evidence,
          estimatedDurationMinutes: 60,
          relatedSkillId: null,
          relatedGoalId: null,
          relatedPlanId: null,
          suggestedAction: null,
        })
      }

      return finish({
        type: 'EXAM_PREPARATION',
        title: `${days} days until your ${examType}: keep the current pace`,
        recommendation: `Your ${examType} exam is ${days} days away.${planNote} Keep the current cadence and record a mock every few weeks, so the plan's pace can be checked against measured results rather than against how the studying feels.`,
        rationale:
          'Calendar time and the plan length are facts from your own record. Nothing here estimates readiness or predicts a result.',
        supportingData: signal.evidence,
        estimatedDurationMinutes: 60,
        relatedSkillId: null,
        relatedGoalId: null,
        relatedPlanId: null,
        suggestedAction: null,
      })
    }

    case 'RECORDED_SCORE_VS_TARGET': {
      const exam = context.exams.find((entry) => entry.id === signal.examId)
      return finish({
        type: 'EXAM_PREPARATION',
        title: 'Your last recorded result next to your target',
        recommendation: `You recorded ${exam?.latestResult?.overallScore ?? 'a score'} against a target of ${exam?.targetScore ?? 'no target'}. Record another mock to see whether the distance between them is changing.`,
        rationale:
          'Both values are ones you recorded and the comparison is arithmetic. LingoPath does not predict whether the target will be reached.',
        supportingData: signal.evidence,
        estimatedDurationMinutes: null,
        relatedSkillId: null,
        relatedGoalId: null,
        relatedPlanId: null,
        suggestedAction: null,
      })
    }

    case 'EXAM_MISSING_FOR_OBJECTIVE': {
      const type = context.objective?.type ?? 'exam'
      return finish({
        type: 'EXAM_PREPARATION',
        title: `Add your ${type} exam date`,
        recommendation: `Your active objective is ${type}, but no ${type} exam is recorded. Add the exam with its date and target score so the countdown and results have something to attach to.`,
        rationale:
          'The objective names a test; without the exam row there is no date to plan against. This is a data gap rather than a study recommendation.',
        supportingData: signal.evidence,
        estimatedDurationMinutes: null,
        relatedSkillId: null,
        relatedGoalId: null,
        relatedPlanId: null,
        suggestedAction: null,
      })
    }

    case 'PLAN_BEHIND': {
      const plan = context.plans.find((entry) => entry.id === signal.planId)
      if (!plan) return null
      return finish({
        type: 'PLAN_ADJUSTMENT',
        title: 'Your plan is running behind its target',
        recommendation: `Study progress is ${plan.studyProgressPercent}% against ${plan.timeProgressPercent}% of the plan's calendar elapsed. Meeting the target from here needs about ${plan.requiredDailyMinutes} minutes a day for the remaining ${plan.remainingDays} days; the other option is moving the plan's end date.`,
        rationale:
          'Both numbers come from the plan you set and the sessions logged against it. Two options are offered and neither is applied — the engine cannot change a plan, and it cannot promise that either option reaches the target.',
        supportingData: signal.evidence,
        estimatedDurationMinutes: plan.requiredDailyMinutes > 0 ? plan.requiredDailyMinutes : null,
        relatedSkillId: null,
        relatedGoalId: null,
        relatedPlanId: plan.id,
        suggestedAction: null,
      })
    }

    case 'PLAN_UNREALISTIC_PACE': {
      const plan = context.plans.find((entry) => entry.id === signal.planId)
      if (!plan) return null
      return finish({
        type: 'PLAN_ADJUSTMENT',
        title: 'The remaining pace is not realistic',
        recommendation: `Study progress is ${plan.studyProgressPercent}% against ${plan.timeProgressPercent}% of the plan's calendar elapsed, with ${plan.remainingDays} day${plan.remainingDays === 1 ? '' : 's'} left. Hitting the target would need ${plan.requiredDailyMinutes} minutes a day — above the ${MAX_REALISTIC_DAILY_MINUTES} minutes this engine treats as sustainable. Consider extending the plan or lowering its target.`,
        rationale:
          'Arithmetic on the plan target, the minutes already logged and the days left. The suggestion to change the plan is a suggestion: nothing is rewritten without your explicit confirmation.',
        supportingData: signal.evidence,
        estimatedDurationMinutes: plan.requiredDailyMinutes,
        relatedSkillId: null,
        relatedGoalId: null,
        relatedPlanId: plan.id,
        suggestedAction: null,
      })
    }

    case 'NO_ASSESSMENT_DATA':
    case 'OBJECTIVE_MISSING':
      // Data gaps inform the caller (data quality notes) but must never become
      // advice, so they are not candidates.
      return null
  }
}

// ─── Selection ───────────────────────────────────────────────────────────────

export interface CandidateOptions {
  /** Hard cap on how many recommendations one generation may return. */
  maxCandidates?: number
}

export const DEFAULT_MAX_CANDIDATES = 4

/**
 * Builds and orders candidates.
 *
 * Attention-worthy observations come first. A positive note is only included when
 * there is little to act on — advice is not a reward scheme — and informational
 * observations fill the remaining slots last.
 */
export function buildCandidates(
  context: RecommendationContext,
  signals: readonly RecommendationSignal[],
  analysis: { confidenceCeiling: ConfidenceLevel },
  options: CandidateOptions = {},
): CandidateRecommendation[] {
  const max = options.maxCandidates ?? DEFAULT_MAX_CANDIDATES

  const eligible = signals.filter((signal) => signal.candidateEligible)

  const built: CandidateRecommendation[] = []
  for (const signal of eligible) {
    const confidence = minConfidence(signal.maxConfidence, analysis.confidenceCeiling)
    const candidate = buildFromSignal({ signal, context, confidence })
    if (candidate) built.push(candidate)
  }

  // One candidate per skill: a skill that is both "not practised recently" and
  // "under-weighted" should produce one recommendation, not two that say the same
  // thing in different words. The build order already puts the most important
  // observation first, so the first one wins.
  const seenSkill = new Set<string>()
  const dedupedBySkill = built.filter((candidate) => {
    if (candidate.relatedSkillId === null) return true
    if (seenSkill.has(candidate.relatedSkillId)) return false
    seenSkill.add(candidate.relatedSkillId)
    return true
  })

  // One candidate per plan, for the same reason: "you are behind" and "the pace
  // you would need is unrealistic" describe one plan, and showing both at once
  // gave contradictory advice (add 240 minutes a day / 240 minutes a day is not
  // realistic). Analysis already keeps them mutually exclusive; this is the
  // guard that keeps a future signal from reintroducing the pair.
  const seenPlan = new Set<string>()
  const deduped = dedupedBySkill.filter((candidate) => {
    if (candidate.relatedPlanId === null) return true
    if (seenPlan.has(candidate.relatedPlanId)) return false
    seenPlan.add(candidate.relatedPlanId)
    return true
  })

  const attention = deduped.filter((candidate) => candidate.severity === 'ATTENTION')
  const positive = deduped.filter((candidate) => candidate.severity === 'POSITIVE')
  const info = deduped.filter((candidate) => candidate.severity === 'INFO')

  const selected: CandidateRecommendation[] = attention.slice(0, max)

  if (selected.length < Math.min(2, max) && positive.length > 0) {
    const first = positive[0]
    if (first) selected.push(first)
  }

  for (const candidate of info) {
    if (selected.length >= max) break
    selected.push(candidate)
  }

  return selected
}

// ─── Feedback ────────────────────────────────────────────────────────────────

/**
 * Applies remembered decisions to fresh candidates.
 *
 * The rule the product promises — "if the user repeatedly rejects a
 * recommendation, do not aggressively repeat it unless new evidence exists" — is
 * implemented as an exact match on `evidenceKey`, which already contains coarse
 * buckets of the underlying numbers. Same key + rejections = silence. Different
 * key = the facts moved, so the observation is allowed back.
 */
export function applyFeedbackRules(
  candidates: readonly CandidateRecommendation[],
  context: RecommendationContext,
): FeedbackApplication {
  const suppressed: SuppressedCandidate[] = []
  const kept: CandidateRecommendation[] = []
  let confidenceAdjusted = 0

  for (const candidate of candidates) {
    // Matched on the evidence fingerprint alone — deliberately *not* on the
    // objective that happened to be active when the decision was taken. A learner
    // who rejected a listening observation twice did not retract that by adding an
    // exam or switching IELTS → TOEFL, yet scoping the match to the objective made
    // every rejection inert the moment either changed. Exam signals already carry
    // the exam type (and, on result signals, the exam id) in their evidence tag, so a
    // switch that really changes the facts produces a new key on its own.
    const relevant = context.feedback.filter((entry) => entry.evidenceKey === candidate.evidenceKey)

    const postponed = relevant.find(
      (entry) => entry.action === 'POSTPONED' && entry.daysAgo < POSTPONE_WINDOW_DAYS,
    )
    if (postponed) {
      suppressed.push({ candidateId: candidate.candidateId, reason: 'POSTPONED' })
      continue
    }

    const rejections = relevant.filter((entry) => REJECTION_ACTIONS.has(entry.action))
    if (rejections.length >= REPEATED_REJECTION_THRESHOLD) {
      suppressed.push({ candidateId: candidate.candidateId, reason: 'REPEATED_REJECTION' })
      continue
    }

    if (rejections.length === 1) {
      // One "no" is a preference, not a prohibition: keep the observation, but
      // stop presenting it with the same confidence as an unanswered one.
      const lowered = minConfidence(candidate.confidence, 'LOW')
      if (lowered !== candidate.confidence) {
        confidenceAdjusted++
        kept.push({ ...candidate, confidence: lowered })
        continue
      }
    }

    kept.push(candidate)
  }

  return { candidates: kept, suppressed, confidenceAdjusted }
}
