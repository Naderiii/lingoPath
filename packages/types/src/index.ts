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

export const LevelAssessmentSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  cefrLevel: CefrLevelEnum,
  assessedAt: z.string().datetime(),
  method: AssessmentMethodEnum,
  notes: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export type LevelAssessment = z.infer<typeof LevelAssessmentSchema>

export const CreateLevelAssessmentSchema = z.object({
  cefrLevel: CefrLevelEnum,
  assessedAt: z.string().datetime(),
  method: AssessmentMethodEnum,
  notes: z.string().max(2000).optional(),
})

export type CreateLevelAssessment = z.infer<typeof CreateLevelAssessmentSchema>

export const ListLevelAssessmentsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export type ListLevelAssessmentsQuery = z.infer<typeof ListLevelAssessmentsQuerySchema>

// ─── Exam & ExamResult ───────────────────────────────────────────────────────

export const ExamResultSchema = z.object({
  id: z.string().uuid(),
  examId: z.string().uuid(),
  isMock: z.boolean(),
  takenAt: z.string().datetime(),
  overallScore: z.number(),
  skillScores: z.record(z.string(), z.number()), // e.g. { listening: 7.5, reading: 8.0 }
  notes: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export type ExamResult = z.infer<typeof ExamResultSchema>

export const CreateExamResultSchema = z.object({
  isMock: z.boolean().default(false),
  takenAt: z.string().datetime(),
  overallScore: z.number().min(0).max(100),
  skillScores: z.record(z.string(), z.number().min(0).max(100)),
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
  notes: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  results: z.array(ExamResultSchema).optional(),
})

export type Exam = z.infer<typeof ExamSchema>

export const CreateExamSchema = z.object({
  type: ExamTypeEnum,
  title: z.string().min(1).max(150),
  objectiveId: z.string().uuid().optional(),
  scheduledAt: z.string().datetime().optional(),
  venue: z.string().max(200).optional(),
  status: ExamStatusEnum.default('PLANNED'),
  notes: z.string().max(2000).optional(),
})

export type CreateExam = z.infer<typeof CreateExamSchema>

export const UpdateExamSchema = CreateExamSchema.partial()
export type UpdateExam = z.infer<typeof UpdateExamSchema>

export const ListExamsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: ExamStatusEnum.optional(),
  type: ExamTypeEnum.optional(),
})

export type ListExamsQuery = z.infer<typeof ListExamsQuerySchema>

// ─── Health Response ─────────────────────────────────────────────────────────

export interface HealthResponse {
  status: 'ok'
}
