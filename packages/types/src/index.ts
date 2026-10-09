import { z } from 'zod'

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

// ─── API Response envelope ────────────────────────────────────────────────────

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

// ─── Skill ───────────────────────────────────────────────────────────────────

export const SkillSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  isDefault: z.boolean(),
  sortOrder: z.number().int(),
})

export type Skill = z.infer<typeof SkillSchema>

// ─── User ─────────────────────────────────────────────────────────────────────

export const UserSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string(),
  timezone: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export type User = z.infer<typeof UserSchema>

// ─── StudySession ─────────────────────────────────────────────────────────────

export const CreateStudySessionSchema = z.object({
  skillId: z.string().uuid(),
  startedAt: z.string().datetime({ message: 'Must be a valid ISO 8601 UTC datetime' }),
  endedAt: z.string().datetime({ message: 'Must be a valid ISO 8601 UTC datetime' }),
  notes: z.string().max(2000).optional(),
  isManual: z.boolean().default(true),
})

export type CreateStudySession = z.infer<typeof CreateStudySessionSchema>

export const UpdateStudySessionSchema = CreateStudySessionSchema.partial()

export type UpdateStudySession = z.infer<typeof UpdateStudySessionSchema>

export const StudySessionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  skillId: z.string().uuid(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime(),
  durationMinutes: z.number().int().min(0),
  notes: z.string().nullable(),
  isManual: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  skill: SkillSchema.optional(),
})

export type StudySession = z.infer<typeof StudySessionSchema>

export const ListStudySessionsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  skillId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
})

export type ListStudySessionsQuery = z.infer<typeof ListStudySessionsQuerySchema>

// ─── Health ───────────────────────────────────────────────────────────────────

export interface HealthResponse {
  status: 'ok'
}
