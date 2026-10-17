import { z } from 'zod'

// ─── Enums ───────────────────────────────────────────────────────────────────

export const ObjectiveTypeEnum = z.enum([
  'IELTS',
  'TOEFL',
  'GENERAL_ENGLISH',
  'IMMIGRATION',
  'CUSTOM',
])
export type ObjectiveType = z.infer<typeof ObjectiveTypeEnum>

export const PlanStatusEnum = z.enum(['ACTIVE', 'COMPLETED', 'ARCHIVED', 'CANCELLED'])
export type PlanStatus = z.infer<typeof PlanStatusEnum>

export const GoalPeriodEnum = z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'])
export type GoalPeriod = z.infer<typeof GoalPeriodEnum>

export const CefrLevelEnum = z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2'])
export type CefrLevel = z.infer<typeof CefrLevelEnum>

export const AssessmentMethodEnum = z.enum(['SELF_REPORTED', 'MOCK_TEST', 'FORMAL_EXAM'])
export type AssessmentMethod = z.infer<typeof AssessmentMethodEnum>

export const ExamTypeEnum = z.enum(['IELTS', 'TOEFL', 'OTHER'])
export type ExamType = z.infer<typeof ExamTypeEnum>

export const ExamStatusEnum = z.enum(['PLANNED', 'REGISTERED', 'COMPLETED', 'CANCELLED'])
export type ExamStatus = z.infer<typeof ExamStatusEnum>

// ─── Pagination ──────────────────────────────────────────────────────────────

export const PaginationQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export type PaginationQuery = z.infer<typeof PaginationQuerySchema>

export interface PaginationMeta {
  nextCursor: string | null
  hasMore: boolean
  limit: number
}

// ─── API Response Envelope ───────────────────────────────────────────────────

export interface ApiSuccess<T> {
  data: T
  meta?: PaginationMeta
}

export interface ApiError {
  error: {
    code: string
    message: string
    details?: unknown
  }
}

// ─── User ─────────────────────────────────────────────────────────────────────

export const UserSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string(),
  timezone: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export type User = z.infer<typeof UserSchema>

// ─── Skill ───────────────────────────────────────────────────────────────────

export const SkillSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  isDefault: z.boolean(),
  sortOrder: z.number().int(),
})

export type Skill = z.infer<typeof SkillSchema>

// ─── Category ────────────────────────────────────────────────────────────────

export const CategorySchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid().nullable(),
  name: z.string(),
  description: z.string().nullable(),
  isDefault: z.boolean(),
  sortOrder: z.number().int(),
})

export type Category = z.infer<typeof CategorySchema>

export const CreateCategorySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  sortOrder: z.number().int().default(0),
})

export type CreateCategory = z.infer<typeof CreateCategorySchema>

export const UpdateCategorySchema = CreateCategorySchema.partial()
export type UpdateCategory = z.infer<typeof UpdateCategorySchema>

// ─── StudySession ─────────────────────────────────────────────────────────────

export const CreateStudySessionSchema = z.object({
  skillId: z.string().uuid(),
  categoryId: z.string().uuid().optional(),
  topic: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
  startedAt: z.string().datetime({ message: 'Must be a valid ISO 8601 UTC datetime' }),
  endedAt: z.string().datetime({ message: 'Must be a valid ISO 8601 UTC datetime' }),
  selfRating: z.number().int().min(1).max(5).optional(),
  notes: z.string().max(2000).optional(),
  isManual: z.boolean().default(true),
  planId: z.string().uuid().optional(),
  milestoneId: z.string().uuid().optional(),
})

export type CreateStudySession = z.infer<typeof CreateStudySessionSchema>

export const UpdateStudySessionSchema = CreateStudySessionSchema.partial()
export type UpdateStudySession = z.infer<typeof UpdateStudySessionSchema>

export const StudySessionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  skillId: z.string().uuid(),
  categoryId: z.string().uuid().nullable(),
  topic: z.string().nullable(),
  description: z.string().nullable(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime(),
  durationMinutes: z.number().int().min(0),
  selfRating: z.number().int().nullable(),
  notes: z.string().nullable(),
  isManual: z.boolean(),
  planId: z.string().uuid().nullable(),
  milestoneId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  skill: SkillSchema.optional(),
  category: CategorySchema.optional(),
})

export type StudySession = z.infer<typeof StudySessionSchema>

export const ListStudySessionsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  skillId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  planId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  search: z.string().max(200).optional(),
  sortBy: z.enum(['startedAt', 'durationMinutes', 'createdAt']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
})

export type ListStudySessionsQuery = z.infer<typeof ListStudySessionsQuerySchema>

// ─── LearningObjective ───────────────────────────────────────────────────────

export const LearningObjectiveSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  type: ObjectiveTypeEnum,
  title: z.string(),
  description: z.string().nullable(),
  targetScore: z.number().nullable(),
  targetDate: z.string().datetime().nullable(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export type LearningObjective = z.infer<typeof LearningObjectiveSchema>

export const CreateLearningObjectiveSchema = z.object({
  type: ObjectiveTypeEnum,
  title: z.string().min(1).max(150),
  description: z.string().max(1000).optional(),
  targetScore: z.number().min(0).max(100).optional(),
  targetDate: z.string().datetime().optional(),
  isActive: z.boolean().default(true),
})

export type CreateLearningObjective = z.infer<typeof CreateLearningObjectiveSchema>

export const UpdateLearningObjectiveSchema = CreateLearningObjectiveSchema.partial()
export type UpdateLearningObjective = z.infer<typeof UpdateLearningObjectiveSchema>

// ─── Multiple Objectives & the Active Objective (Phase 9) ─────────────────────
//
// Several objectives can exist at once (IELTS, TOEFL, General English,
// Immigration, custom). Exactly one may be designated *active*: that is the
// objective plan/exam defaults and the signals below follow. The designation
// lives in `users.active_objective_id`, so "at most one active objective" is a
// database guarantee rather than a convention every writer has to remember.

export const SetActiveObjectiveSchema = z.object({
  /** `null` clears the focus without deleting any objective. */
  objectiveId: z.string().uuid().nullable(),
})

export type SetActiveObjective = z.infer<typeof SetActiveObjectiveSchema>

/** Why the active objective is missing, so the UI can say something useful. */
export type ActiveObjectiveStatus = 'SET' | 'NONE_SET' | 'NONE_CREATED'

/**
 * One factual observation about the active objective.
 *
 * `basedOn` names the explicit fact the signal came from — a date or score the
 * learner recorded, or a field that is empty. Signals never carry readiness or
 * ability verdicts, and are never derived from study time; the module that
 * builds them (`apps/api/src/modules/objectives/objective.signals.ts`) documents
 * that boundary and is covered by a guard test.
 */
export interface ObjectiveSignal {
  id: string
  kind: 'OBJECTIVE' | 'DATA_GAP' | 'TIMELINE' | 'RECORDED_SCORE'
  title: string
  detail: string
  basedOn: string
}

export interface ActiveObjectiveExamSummary {
  id: string
  title: string
  type: ExamType
  status: ExamStatus
  scheduledAt: string | null
  targetScore: number | null
  targetDate: string | null
}

export interface ActiveObjectiveLatestResult {
  examId: string
  examTitle: string
  takenAt: string
  isMock: boolean
  overallScore: number | null
  skillScores: Record<string, number>
}

export interface ActiveObjectiveLatestAssessment {
  id: string
  assessedAt: string
  method: AssessmentMethod
  cefrLevel: CefrLevel | null
}

/**
 * Everything the planning UI needs about the current focus, resolved server-side
 * in the learner's timezone so the client never recomputes a day countdown.
 */
export interface ActiveObjectiveContext {
  objective: LearningObjective | null
  status: ActiveObjectiveStatus
  timezone: string
  today: string
  /** Whole days from today to `targetDate`; negative once the date has passed. */
  daysUntilTargetDate: number | null
  isTargetDatePassed: boolean
  linkedPlanCount: number
  linkedGoalCount: number
  linkedExams: ActiveObjectiveExamSummary[]
  /** Most recent exam result recorded against one of the linked exams. */
  latestRecordedResult: ActiveObjectiveLatestResult | null
  latestAssessment: ActiveObjectiveLatestAssessment | null
  signals: ObjectiveSignal[]
}

// ─── LongTermPlan & PlanMilestone ───────────────────────────────────────────

export const PlanMilestoneSchema = z.object({
  id: z.string().uuid(),
  planId: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  targetMinutes: z.number().int().min(0),
  skillId: z.string().uuid().nullable(),
  status: PlanStatusEnum,
  ordering: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  skill: SkillSchema.optional(),
})

export type PlanMilestone = z.infer<typeof PlanMilestoneSchema>

export const CreatePlanMilestoneSchema = z.object({
  title: z.string().min(1).max(150),
  description: z.string().max(1000).optional(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  targetMinutes: z.number().int().min(0),
  skillId: z.string().uuid().optional(),
  status: PlanStatusEnum.default('ACTIVE'),
  ordering: z.number().int().default(0),
})

export type CreatePlanMilestone = z.infer<typeof CreatePlanMilestoneSchema>

export const UpdatePlanMilestoneSchema = CreatePlanMilestoneSchema.partial()
export type UpdatePlanMilestone = z.infer<typeof UpdatePlanMilestoneSchema>

export const LongTermPlanSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  targetMinutes: z.number().int().min(0),
  status: PlanStatusEnum,
  objectiveId: z.string().uuid().nullable(),
  examId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  objective: LearningObjectiveSchema.optional(),
  milestones: z.array(PlanMilestoneSchema).optional(),
})

export type LongTermPlan = z.infer<typeof LongTermPlanSchema>

export const CreateLongTermPlanSchema = z.object({
  title: z.string().min(1).max(150),
  description: z.string().max(2000).optional(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  targetMinutes: z.number().int().min(0),
  status: PlanStatusEnum.default('ACTIVE'),
  objectiveId: z.string().uuid().optional(),
  examId: z.string().uuid().optional(),
})

export type CreateLongTermPlan = z.infer<typeof CreateLongTermPlanSchema>

export const UpdateLongTermPlanSchema = CreateLongTermPlanSchema.partial()
export type UpdateLongTermPlan = z.infer<typeof UpdateLongTermPlanSchema>

export const ListPlansQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: PlanStatusEnum.optional(),
})

export type ListPlansQuery = z.infer<typeof ListPlansQuerySchema>

// ─── Goal & GoalSkillTarget ──────────────────────────────────────────────────

export const GoalSkillTargetSchema = z.object({
  id: z.string().uuid(),
  goalId: z.string().uuid(),
  skillId: z.string().uuid(),
  targetMinutes: z.number().int().min(0),
  skill: SkillSchema.optional(),
})

export type GoalSkillTarget = z.infer<typeof GoalSkillTargetSchema>

export const CreateGoalSkillTargetSchema = z.object({
  skillId: z.string().uuid(),
  targetMinutes: z.number().int().min(0),
})

export type CreateGoalSkillTarget = z.infer<typeof CreateGoalSkillTargetSchema>

export const GoalSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  period: GoalPeriodEnum,
  targetMinutes: z.number().int().min(0),
  startDate: z.string().datetime(),
  endDate: z.string().datetime().nullable(),
  isActive: z.boolean(),
  planId: z.string().uuid().nullable(),
  objectiveId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  skillTargets: z.array(GoalSkillTargetSchema).optional(),
})

export type Goal = z.infer<typeof GoalSchema>

export const CreateGoalSchema = z.object({
  period: GoalPeriodEnum,
  targetMinutes: z.number().int().min(0),
  startDate: z.string().datetime(),
  endDate: z.string().datetime().optional(),
  isActive: z.boolean().default(true),
  planId: z.string().uuid().optional(),
  objectiveId: z.string().uuid().optional(),
  skillTargets: z.array(CreateGoalSkillTargetSchema).optional(),
})

export type CreateGoal = z.infer<typeof CreateGoalSchema>

export const UpdateGoalSchema = CreateGoalSchema.partial()
export type UpdateGoal = z.infer<typeof UpdateGoalSchema>

export const ListGoalsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  period: GoalPeriodEnum.optional(),
  isActive: z.coerce.boolean().optional(),
})

export type ListGoalsQuery = z.infer<typeof ListGoalsQuerySchema>

// ─── LevelAssessment (CEFR) ──────────────────────────────────────────────────

// Phase 9 — a CEFR assessment records a level per dimension. All five are
// optional because an assessment only covers what was actually measured: a
// self-assessment may rate speaking alone, a formal exam may report all four
// skills. `null` means "not assessed" — never "unknown" and never "estimated".
//
// Levels are recorded, never inferred. Nothing here links an assessment to study
// time, and no endpoint derives a level from hours studied.

export type LevelDimension = 'overall' | 'listening' | 'reading' | 'writing' | 'speaking'

export const LevelAssessmentSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  /** Overall level of this assessment. */
  cefrLevel: CefrLevelEnum.nullable(),
  listeningLevel: CefrLevelEnum.nullable(),
  readingLevel: CefrLevelEnum.nullable(),
  writingLevel: CefrLevelEnum.nullable(),
  speakingLevel: CefrLevelEnum.nullable(),
  assessedAt: z.string().datetime(),
  method: AssessmentMethodEnum,
  notes: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export type LevelAssessment = z.infer<typeof LevelAssessmentSchema>

/**
 * The "at least one dimension recorded" rule lives in the assessment service
 * rather than here, so create and update share one definition and an update can
 * be validated against the merged row.
 */
export const CreateLevelAssessmentSchema = z.object({
  cefrLevel: CefrLevelEnum.optional(),
  listeningLevel: CefrLevelEnum.optional(),
  readingLevel: CefrLevelEnum.optional(),
  writingLevel: CefrLevelEnum.optional(),
  speakingLevel: CefrLevelEnum.optional(),
  assessedAt: z.string().datetime(),
  method: AssessmentMethodEnum,
  notes: z.string().max(2000).optional(),
})

export type CreateLevelAssessment = z.infer<typeof CreateLevelAssessmentSchema>

export const UpdateLevelAssessmentSchema = z.object({
  cefrLevel: CefrLevelEnum.nullable().optional(),
  listeningLevel: CefrLevelEnum.nullable().optional(),
  readingLevel: CefrLevelEnum.nullable().optional(),
  writingLevel: CefrLevelEnum.nullable().optional(),
  speakingLevel: CefrLevelEnum.nullable().optional(),
  assessedAt: z.string().datetime().optional(),
  method: AssessmentMethodEnum.optional(),
  notes: z.string().max(2000).nullable().optional(),
})

export type UpdateLevelAssessment = z.infer<typeof UpdateLevelAssessmentSchema>

export const ListLevelAssessmentsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export type ListLevelAssessmentsQuery = z.infer<typeof ListLevelAssessmentsQuerySchema>

/**
 * The most recently *recorded* level for one dimension, with the assessment it
 * came from. `previous*` is the recording before it, so the UI can show a change
 * without inventing a baseline.
 */
export interface LevelDimensionSnapshot {  dimension: LevelDimension
  assessmentId: string
  level: CefrLevel
  /** `A1 → 1 … C2 → 6`. The only ordering rule for CEFR levels. */
  rank: number
  assessedAt: string
  method: AssessmentMethod
  previousLevel: CefrLevel | null
  previousRank: number | null
  previousAssessedAt: string | null
  /** `null` when this is the first recording for the dimension. */
  changeDirection: 'up' | 'down' | 'same' | null
  changeSteps: number | null
}

/** Levels of one assessment, keyed by dimension. `null` = not assessed. */
export interface LevelAssessmentLevels {
  overall: CefrLevel | null
  listening: CefrLevel | null
  reading: CefrLevel | null
  writing: CefrLevel | null
  speaking: CefrLevel | null
}

/**
 * One history entry: the stored assessment plus its per-dimension levels.
 *
 * `levels` is computed by the API, so a client never needs to know which column
 * holds which dimension.
 */
export interface LevelAssessmentEntry extends LevelAssessment {
  levels: LevelAssessmentLevels
}

export interface LevelOverviewResponse {
  /**
   * Constant marker that every level here comes from an assessment the learner
   * recorded. Kept in the contract so the UI can state the provenance of the
   * numbers on screen instead of implying they were measured some other way.
   */
  basis: 'RECORDED_ASSESSMENTS'
  timezone: string
  today: string
  /** Display order, decided by the API so the UI cannot drift from it. */
  dimensions: LevelDimension[]
  rankByLevel: Record<CefrLevel, number>
  current: Record<LevelDimension, LevelDimensionSnapshot | null>
  /** Assessments, newest first, bounded by `limit`. */
  history: LevelAssessmentEntry[]
  totalAssessments: number
  hasMore: boolean
  nextCursor: string | null
  limit: number
}

// ─── Exam & ExamResult ───────────────────────────────────────────────────────

// Phase 9 — exam scoring.
//
// Scores are not compared against one hardcoded maximum: `Exam.scoreScale`
// carries a scale descriptor that the API resolves (see
// `apps/api/src/modules/exams/exam.scoring.ts`) and every score is validated
// against *its own exam's* scale. That is what lets an IELTS band (0–9, step 0.5)
// and a TOEFL total (0–120) live in the same columns, and what makes a future
// scoring change a preset change instead of a schema migration.

export interface ExamScoreSection {
  key: string
  label: string
  max: number | null
}

export interface ExamScoreScale {
  key: string
  label: string
  kind: 'BAND' | 'TOTAL' | 'CUSTOM'
  min: number
  max: number | null
  step: number | null
  /** Decimals to render with — `1` for an IELTS band, `0` for a TOEFL total. */
  decimals: number
  /** What `Exam.targetScore` means on this scale: "Target band" / "Target score". */
  targetLabel: string
  sections: ExamScoreSection[]
}

/** Where an exam's effective scale came from — shown so a default is never mistaken for a choice. */
export type ExamScaleSource = 'EXAM' | 'TYPE_DEFAULT' | 'NONE'

/**
 * Accepted input for `Exam.scoreScale`: a preset key, that preset with explicit
 * overrides, or a complete custom definition. The API resolves what was sent
 * into a full `ExamScoreScale` and rejects an incomplete unknown key.
 */
export const ExamScoreScaleInputSchema = z.object({
  key: z.string().min(1).max(60),
  label: z.string().min(1).max(80).optional(),
  kind: z.enum(['BAND', 'TOTAL', 'CUSTOM']).optional(),
  min: z.number().finite().optional(),
  max: z.number().finite().nullable().optional(),
  step: z.number().finite().positive().nullable().optional(),
  targetLabel: z.string().min(1).max(60).optional(),
  sections: z
    .array(
      z.object({
        key: z.string().min(1).max(40),
        label: z.string().min(1).max(60).optional(),
        max: z.number().finite().nullable().optional(),
      }),
    )
    .optional(),
})

export type ExamScoreScaleInput = z.infer<typeof ExamScoreScaleInputSchema>

export interface ExamScoreScaleListResponse {
  data: ExamScoreScale[]
  /** Default scale key per exam type; `null` when a type has no built-in scale. */
  defaults: Record<ExamType, string | null>
}

export const ExamResultSchema = z.object({
  id: z.string().uuid(),
  examId: z.string().uuid(),
  isMock: z.boolean(),
  takenAt: z.string().datetime(),
  /** Recorded as reported; `null` when only section scores were recorded. */
  overallScore: z.number().nullable(),
  skillScores: z.record(z.string(), z.number()), // e.g. { listening: 7.5, reading: 8.0 }
  notes: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export type ExamResult = z.infer<typeof ExamResultSchema>

/**
 * Only the outer shape is validated here (finite, non-negative). The exam's own
 * scale decides the real bounds, so a TOEFL total of 120 is valid while an IELTS
 * band above 9 is not — and neither rule is duplicated in this schema.
 */
export const CreateExamResultSchema = z.object({
  isMock: z.boolean().default(false),
  takenAt: z.string().datetime(),
  overallScore: z.number().finite().nonnegative().optional(),
  skillScores: z.record(z.string(), z.number().finite().nonnegative()).optional(),
  notes: z.string().max(2000).optional(),
})

export type CreateExamResult = z.infer<typeof CreateExamResultSchema>

export const ExamSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  objectiveId: z.string().uuid().nullable(),
  type: ExamTypeEnum,
  title: z.string(),
  scheduledAt: z.string().datetime().nullable(),
  venue: z.string().nullable(),
  status: ExamStatusEnum,
  targetScore: z.number().nullable(),
  targetDate: z.string().datetime().nullable(),
  scoreScale: ExamScoreScaleInputSchema.nullable(),
  notes: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  results: z.array(ExamResultSchema).optional(),
})

export type Exam = z.infer<typeof ExamSchema>

/** An exam plus the scale its scores are read against, resolved by the API. */
export interface ExamWithScale extends Exam {
  scale: ExamScoreScale | null
  scaleSource: ExamScaleSource
  /** Present when the exam is linked to an objective. */
  objective?: { id: string; title: string } | null
}

export const CreateExamSchema = z.object({
  type: ExamTypeEnum,
  title: z.string().min(1).max(150),
  objectiveId: z.string().uuid().optional(),
  scheduledAt: z.string().datetime().optional(),
  venue: z.string().max(200).optional(),
  status: ExamStatusEnum.default('PLANNED'),
  targetScore: z.number().finite().nonnegative().optional(),
  targetDate: z.string().datetime().optional(),
  scoreScale: ExamScoreScaleInputSchema.optional(),
  notes: z.string().max(2000).optional(),
})

export type CreateExam = z.infer<typeof CreateExamSchema>

/**
 * Explicit `null` clears a stored value; an omitted field is left untouched.
 * The nullable set is narrower than `.partial()` alone, which cannot express the
 * difference between "leave it" and "remove it".
 */
export const UpdateExamSchema = CreateExamSchema.partial().extend({
  objectiveId: z.string().uuid().nullable().optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
  targetScore: z.number().finite().nonnegative().nullable().optional(),
  targetDate: z.string().datetime().nullable().optional(),
  scoreScale: ExamScoreScaleInputSchema.nullable().optional(),
})

export type UpdateExam = z.infer<typeof UpdateExamSchema>

export const ListExamsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: ExamStatusEnum.optional(),
  type: ExamTypeEnum.optional(),
})

export type ListExamsQuery = z.infer<typeof ListExamsQuerySchema>

// ─── Study Calendar & Streaks ────────────────────────────────────────────────
//
// Contracts for the Phase 7 calendar heatmap, day drill-down, and streaks.
//
// These are deliberately *type-only* declarations: the runtime validation schemas
// for the calendar module live next to its routes in `apps/api` so that API unit
// tests never depend on this package's build output. The single source of truth
// for both the heatmap buckets and the streak rule is the API module
// `apps/api/src/modules/calendar/calendar.domain.ts`.

/** How the requested calendar window was resolved from the request. */
export type CalendarRangeKind = 'CURRENT_YEAR' | 'PREVIOUS_YEAR' | 'CUSTOM'

export interface CalendarRange {
  kind: CalendarRangeKind
  /** Inclusive first day, `YYYY-MM-DD`, expressed in the user's timezone. */
  from: string
  /** Inclusive last day, `YYYY-MM-DD`, expressed in the user's timezone. */
  to: string
  /** Calendar year when the range came from a year selector, else `null`. */
  year: number | null
}

/**
 * One cell of the heatmap. `intensity` is `0` for a day with no study and
 * `1..intensityThresholds.length + 1` otherwise, so the scale grows with the
 * configured thresholds.
 */
export interface CalendarDay {
  date: string
  totalMinutes: number
  sessionCount: number
  intensity: number
  /** `totalMinutes >= streakQualifyingMinutes` (and never true for zero minutes). */
  qualified: boolean
}

/** Human-readable definition of one intensity bucket, produced by the server. */
export interface CalendarIntensityLevel {
  level: number
  minMinutes: number
  maxMinutes: number | null
  label: string
}

export interface CalendarRangeSummary {
  totalMinutes: number
  sessionCount: number
  activeDays: number
  qualifyingDays: number
  /** Rounded mean over days that have at least one minute of study. */
  averageMinutesPerActiveDay: number
  bestDay: { date: string; totalMinutes: number } | null
}

export interface CalendarResponse {
  range: CalendarRange
  timezone: string
  /** Bucket upper bounds; level `i` covers `(thresholds[i-1], thresholds[i]]`. */
  intensityThresholds: number[]
  /** Highest intensity level a day can reach with the current thresholds. */
  maxIntensityLevel: number
  /** Legend-ready bucket definitions (`0`, `1–20 min`, … `91+ min`). */
  intensityLevels: CalendarIntensityLevel[]
  streakQualifyingMinutes: number
  /** Today in the user's timezone — drives the "today" ring in the UI. */
  today: string
  days: CalendarDay[]
  summary: CalendarRangeSummary
}

export interface CalendarBreakdownSkill {
  skillId: string
  name: string
  minutes: number
  sessionCount: number
  percentage: number
}

export interface CalendarBreakdownCategory {
  categoryId: string | null
  name: string
  minutes: number
  sessionCount: number
  percentage: number
}

export interface CalendarBreakdownTopic {
  topic: string
  minutes: number
  sessionCount: number
  percentage: number
}

export interface CalendarDaySession {
  id: string
  startedAt: string
  endedAt: string
  durationMinutes: number
  skillId: string
  skillName: string
  categoryId: string | null
  categoryName: string | null
  topic: string | null
  description: string | null
  notes: string | null
  selfRating: number | null
  isManual: boolean
  planId: string | null
  planTitle: string | null
  milestoneId: string | null
  milestoneTitle: string | null
}

export interface CalendarDayNote {
  sessionId: string
  topic: string | null
  notes: string
  durationMinutes: number
  startedAt: string
}

/** Payload for clicking a single heatmap day. */
export interface CalendarDayDetailResponse {
  date: string
  timezone: string
  totalMinutes: number
  sessionCount: number
  intensity: number
  qualified: boolean
  streakQualifyingMinutes: number
  intensityThresholds: number[]
  /** Local time (`HH:mm`) of the first and last session of the day. */
  firstSessionLocalTime: string | null
  lastSessionLocalTime: string | null
  skills: CalendarBreakdownSkill[]
  categories: CalendarBreakdownCategory[]
  topics: CalendarBreakdownTopic[]
  /** Sessions that carry free-text notes, newest first. */
  notes: CalendarDayNote[]
  sessions: CalendarDaySession[]
}

export interface StreakSummaryResponse {
  timezone: string
  qualifyingMinutes: number
  currentStreak: number
  longestStreak: number
  currentStreakStart: string | null
  currentStreakEnd: string | null
  longestStreakStart: string | null
  longestStreakEnd: string | null
  today: string
  todayMinutes: number
  todayQualified: boolean
  /** True when today is not qualified yet but the streak is still alive. */
  todayPending: boolean
  lastQualifiedDate: string | null
  totalQualifiedDays: number
  /** Minutes still needed for today to count, `0` once it qualifies. */
  minutesToQualifyToday: number
}

export interface CalendarSettingsResponse {
  timezone: string
  /** Today in the user's timezone — lets the UI default its range without guessing. */
  today: string
  intensityThresholds: number[]
  intensityLevels: CalendarIntensityLevel[]
  streakQualifyingMinutes: number
  /** `USER` when a stored preference exists, `DEFAULT` when built-ins apply. */
  source: 'USER' | 'DEFAULT'
  updatedAt: string | null
}

export interface UpdateCalendarSettingsInput {
  intensityThresholds?: number[]
  streakQualifyingMinutes?: number
}

// ─── Analytics (Phase 8) ─────────────────────────────────────────────
//
// Type-only declarations mirroring `GET /api/v1/analytics`. The runtime schema
// for the request lives in `apps/api/src/modules/analytics/analytics.schemas.ts`
// so API tests never depend on this package's build output.

export type AnalyticsRangeKind =
  | '7d'
  | '30d'
  | '90d'
  | 'current-year'
  | 'previous-year'
  | 'custom'

export type AnalyticsTrendGranularity = 'day' | 'week' | 'month'

export interface AnalyticsTrendPoint {
  /** Day key for `day`, Monday day key for `week`, `YYYY-MM` for `month`. */
  bucket: string
  minutes: number
  sessions: number
}

export interface AnalyticsMetricDelta {
  current: number
  previous: number
  absolute: number
  /** `null` when a percentage would mislead (previous period was zero). */
  changePercent: number | null
  zeroBaseline: boolean
  direction: 'up' | 'down' | 'flat'
}

export interface AnalyticsSkillTrend extends AnalyticsMetricDelta {
  currentMinutes: number
  previousMinutes: number
}

export interface AnalyticsSkill {
  skillId: string
  name: string
  totalMinutes: number
  percentage: number
  sessions: number
  averageSessionMinutes: number
  trend: AnalyticsSkillTrend
}

export interface AnalyticsSummary {
  totalMinutes: number
  totalMinutesFormatted: string
  totalSessions: number
  activeDays: number
  inactiveDays: number
  daysInRange: number
  averageDailyMinutes: number
  averageSessionMinutes: number
  longestSession: {
    id: string
    minutes: number
    minutesFormatted: string
    date: string
    skillId: string
  } | null
  currentStreak: number
  longestStreak: number
  qualifyingMinutes: number
  dailyTargetMinutes: number
  daysMeetingTarget: number
  percentageOfDaysMeetingTarget: number
}

export interface AnalyticsComparisonSide {
  from: string
  to: string
  totalMinutes: number
  totalSessions: number
  activeDays: number
  averageDailyMinutes: number
}

export interface AnalyticsPlanMilestone {
  milestoneId: string
  title: string
  status: string
  startDate: string
  endDate: string
  targetMinutes: number
  actualMinutes: number
  progressPercent: number
  remainingDays: number
  isCurrent: boolean
  isNext: boolean
}

export interface AnalyticsPlan {
  planId: string
  title: string
  objectiveTitle: string | null
  startDate: string
  endDate: string
  targetMinutes: number
  actualMinutes: number
  remainingMinutes: number
  unassignedMinutes: number
  studyProgressPercent: number
  timeProgressPercent: number
  elapsedDays: number
  totalDays: number
  remainingDays: number
  paceStatus: 'ahead' | 'on-track' | 'behind' | 'not-started' | 'completed'
  requiredDailyMinutes: number
  milestones: AnalyticsPlanMilestone[]
  monthly: Array<{ month: string; totalMinutes: number }>
  weekly: Array<{ weekStart: string; totalMinutes: number }>
}

export interface AnalyticsGoalProgress {
  id: string
  period: GoalPeriod
  targetMinutes: number
  actualMinutes: number
  remainingMinutes: number
  percentage: number
  status: string
}

export interface AnalyticsPayload {
  range: {
    kind: AnalyticsRangeKind
    from: string
    to: string
    days: number
    comparisonBasis: 'preceding-window' | 'same-period-last-year'
  }
  previousRange: { from: string; to: string }
  timezone: string
  summary: AnalyticsSummary
  skills: AnalyticsSkill[]
  trends: { granularity: AnalyticsTrendGranularity; points: AnalyticsTrendPoint[] }
  comparison: {
    current: AnalyticsComparisonSide
    previous: AnalyticsComparisonSide
    deltas: {
      totalMinutes: AnalyticsMetricDelta
      totalSessions: AnalyticsMetricDelta
      activeDays: AnalyticsMetricDelta
      averageDailyMinutes: AnalyticsMetricDelta
    }
  }
  plans: AnalyticsPlan[]
  goals: AnalyticsGoalProgress[]
}

// ─── Health Response ─────────────────────────────────────────────────────────

export interface HealthResponse {
  status: 'ok'
}
