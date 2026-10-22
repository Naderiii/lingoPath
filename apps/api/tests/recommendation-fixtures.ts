/**
 * Fixtures for the Phase 10 recommendation tests.
 *
 * The defaults describe a mid-sized, healthy account: twenty sessions across
 * sixteen active days, all four skills practised within the last two days, a
 * recorded CEFR assessment, no exam and no plan. Every test overrides only the
 * part of that picture it is about, so a failure points at the rule under test
 * rather than at an unrelated default.
 *
 * `share` is derived from the skill minutes, exactly as the real context builder
 * derives it, so a fixture cannot present shares that do not add up.
 */

import type {
  AssessmentMethod,
  CefrLevel,
  LevelDimension,
  RecommendationAction,
  RecommendationType,
} from '@lingopath/types'
import type {
  ContextAssessment,
  ContextExam,
  ContextFeedback,
  ContextGoal,
  ContextGoalCompletion,
  ContextPlan,
  ContextSkill,
  ContextObjective,
  RecommendationContext,
} from '../src/modules/recommendations/recommendation.context.js'

export const SKILL_IDS = {
  vocabulary: '11111111-1111-4111-8111-111111111111',
  grammar: '22222222-2222-4222-8222-222222222222',
  listening: '33333333-3333-4333-8333-333333333333',
  reading: '44444444-4444-4444-8444-444444444444',
  writing: '55555555-5555-4555-8555-555555555555',
  speaking: '66666666-6666-4666-8666-666666666666',
  pronunciation: '77777777-7777-4777-8777-777777777777',
  conversation: '88888888-8888-4888-8888-888888888888',
} as const

export type SkillKey = keyof typeof SKILL_IDS

export const SKILL_NAMES: Record<SkillKey, string> = {
  vocabulary: 'Vocabulary',
  grammar: 'Grammar',
  listening: 'Listening',
  reading: 'Reading',
  writing: 'Writing',
  speaking: 'Speaking',
  pronunciation: 'Pronunciation',
  conversation: 'Conversation',
}

export const DEFAULT_TODAY = '2026-03-15'

export interface ContextOptions {
  sessions?: number
  activeDays?: number
  recentMinutes?: number
  priorMinutes?: number
  recentActiveDays?: number
  lastSessionDaysAgo?: number | null
  currentStreak?: number
  longestStreak?: number
  medianSessionMinutes?: number | null
  avgSessionMinutes?: number | null
  skillMinutes?: Partial<Record<SkillKey, number>>
  lastPractised?: Partial<Record<SkillKey, number | null>>
  referencedByGoal?: SkillKey[]
  referencedByPlan?: SkillKey[]
  goals?: ContextGoal[]
  goalCompletion?: Partial<ContextGoalCompletion>
  plans?: ContextPlan[]
  assessment?: Partial<ContextAssessment> | null
  exams?: ContextExam[]
  objective?: ContextObjective | null
  hasAnyObjective?: boolean
  feedback?: ContextFeedback[]
}

function buildSkills(options: ContextOptions): {
  skills: ContextSkill[]
  totalMinutes: number
} {
  const minutes: Partial<Record<SkillKey, number>> = options.skillMinutes ?? {
    vocabulary: 200,
    grammar: 120,
    listening: 100,
    reading: 80,
    writing: 60,
    speaking: 40,
  }

  const totalMinutes = Object.values(minutes).reduce((sum, value) => sum + (value ?? 0), 0)

  const skills = (Object.keys(minutes) as SkillKey[])
    .filter((key) => (minutes[key] ?? 0) > 0)
    .map((key) => {
      const skillMinutes = minutes[key] ?? 0
      return {
        id: SKILL_IDS[key],
        name: SKILL_NAMES[key],
        totalMinutes: skillMinutes,
        totalSessions: Math.max(1, Math.round(skillMinutes / 30)),
        recentMinutes: Math.round(skillMinutes / 3),
        recentSessions: Math.max(1, Math.round(skillMinutes / 90)),
        priorMinutes: Math.round(skillMinutes / 4),
        share: totalMinutes > 0 ? skillMinutes / totalMinutes : 0,
        lastPracticedDaysAgo:
          options.lastPractised?.[key] !== undefined ? (options.lastPractised[key] ?? null) : 2,
        referencedByGoal: options.referencedByGoal?.includes(key) ?? false,
        referencedByPlan: options.referencedByPlan?.includes(key) ?? false,
      }
    })

  return { skills, totalMinutes }
}

function buildAssessment(input: Partial<ContextAssessment> | null | undefined): ContextAssessment {
  if (input === null) {
    return {
      recorded: false,
      assessedOn: null,
      method: null,
      levels: { overall: null, listening: null, reading: null, writing: null, speaking: null },
    }
  }

  const levels: Record<LevelDimension, CefrLevel | null> = {
    overall: 'B2',
    listening: 'B2',
    reading: 'B1',
    writing: 'C1',
    speaking: 'B1',
    ...(input?.levels ?? {}),
  }

  return {
    recorded: input?.recorded ?? true,
    assessedOn: input?.assessedOn ?? '2026-03-01',
    method: (input?.method ?? 'SELF_REPORTED') as AssessmentMethod,
    levels,
  }
}

export function makeContext(options: ContextOptions = {}): RecommendationContext {
  const { skills, totalMinutes } = buildSkills(options)

  const sessions = options.sessions ?? 20
  const activeDays = options.activeDays ?? 16
  const goalCompletion: ContextGoalCompletion = {
    trackedDays: 14,
    daysMeetingTarget: 0,
    dailyTargetMinutes: null,
    rate: null,
    averageActiveDayMinutes: 0,
    ...options.goalCompletion,
  }

  return {
    generatedAt: `${DEFAULT_TODAY}T12:00:00.000Z`,
    today: DEFAULT_TODAY,
    objective: options.objective ?? null,
    hasAnyObjective: options.hasAnyObjective ?? true,
    activity: {
      windowDays: 14,
      recent: {
        days: 14,
        minutes: options.recentMinutes ?? 240,
        sessions: 8,
        activeDays: options.recentActiveDays ?? 8,
      },
      prior: { days: 14, minutes: options.priorMinutes ?? 220, sessions: 7, activeDays: 7 },
      lifetime: {
        minutes: totalMinutes,
        sessions,
        activeDays,
        firstSessionDay: '2026-01-05',
      },
      currentStreak: options.currentStreak ?? 4,
      longestStreak: options.longestStreak ?? 12,
      lastSessionDaysAgo: options.lastSessionDaysAgo !== undefined ? options.lastSessionDaysAgo : 1,
      averageSessionMinutes: options.avgSessionMinutes ?? 30,
      medianSessionMinutes: options.medianSessionMinutes ?? 30,
      preferredStartHour: 19,
    },
    skills,
    goals: options.goals ?? [],
    goalCompletion,
    plans: options.plans ?? [],
    assessment: buildAssessment(options.assessment),
    exams: options.exams ?? [],
    feedback: options.feedback ?? [],
  }
}

export function makeGoal(input: Partial<ContextGoal> & { id: string }): ContextGoal {
  return {
    period: 'DAILY',
    targetMinutes: 60,
    actualMinutes: 30,
    percentage: 50,
    status: 'in_progress',
    startedOn: '2026-01-01',
    planId: null,
    objectiveId: null,
    skillTargets: [],
    ...input,
  }
}

export function makeExam(input: Partial<ContextExam> & { id: string }): ContextExam {
  return {
    type: 'IELTS',
    status: 'PLANNED',
    daysUntil: 21,
    targetScore: 7,
    latestResult: null,
    ...input,
  }
}

export function makeObjective(input: Partial<ContextObjective> = {}): ContextObjective {
  return {
    id: 'objective-ielts',
    type: 'IELTS',
    targetScore: 7,
    targetDate: '2026-06-01',
    daysUntilTargetDate: 78,
    ...input,
  }
}

export function makeFeedback(
  input: Partial<ContextFeedback> & { type: RecommendationType; action: RecommendationAction },
): ContextFeedback {
  return {
    evidenceKey: null,
    objectiveId: null,
    decidedAt: '2026-03-10T09:00:00.000Z',
    daysAgo: 5,
    ...input,
  }
}

export function makePlan(input: Partial<ContextPlan> & { id: string }): ContextPlan {
  return {
    targetMinutes: 6000,
    actualMinutes: 1200,
    studyProgressPercent: 20,
    timeProgressPercent: 50,
    remainingDays: 45,
    paceStatus: 'behind',
    requiredDailyMinutes: 107,
    currentMilestone: null,
    ...input,
  }
}

/** A minimal raw payload for `buildRecommendationContext` tests. */
export function makeRawData(overrides: Record<string, unknown> = {}) {
  return {
    now: new Date('2026-03-15T12:00:00Z'),
    timezone: 'UTC',
    objective: null,
    hasAnyObjective: false,
    lifetime: {
      minutes: 0,
      sessions: 0,
      activeDays: 0,
      firstStartedAt: null,
      lastStartedAt: null,
    },
    skillTotals: [],
    buckets: [],
    skillRecency: [],
    sessionPattern: { medianMinutes: null, preferredStartHour: null },
    skills: [],
    goals: [],
    plans: [],
    assessments: [],
    exams: [],
    feedback: [],
    streak: { currentStreak: 0, longestStreak: 0 },
    ...overrides,
  }
}
