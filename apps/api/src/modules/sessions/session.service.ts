import type { SessionRepository } from './session.repository.js'
import type {
  CreateStudySession,
  UpdateStudySession,
  ListStudySessionsQuery,
} from '@lingopath/types'
import { NotFoundError, ValidationError } from '../../shared/errors.js'

// Business rule: session must not exceed 16 hours (protection against timer bugs)
const MAX_SESSION_MINUTES = 16 * 60

function computeDurationMinutes(startedAt: string, endedAt: string): number {
  const start = new Date(startedAt).getTime()
  const end = new Date(endedAt).getTime()
  return Math.round((end - start) / 60_000)
}

function validateSessionTimes(startedAt: string, endedAt: string): void {
  const start = new Date(startedAt)
  const end = new Date(endedAt)

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new ValidationError('startedAt and endedAt must be valid dates')
  }

  if (end <= start) {
    throw new ValidationError('endedAt must be after startedAt')
  }

  const durationMinutes = computeDurationMinutes(startedAt, endedAt)
  if (durationMinutes <= 0) {
    throw new ValidationError('Session duration must be at least 1 minute')
  }
  if (durationMinutes > MAX_SESSION_MINUTES) {
    throw new ValidationError(
      `Session duration cannot exceed ${MAX_SESSION_MINUTES} minutes (16 hours)`,
    )
  }
}

export function createSessionService(repository: SessionRepository) {
  return {
    async listSessions(userId: string, query: ListStudySessionsQuery) {
      const result = await repository.findMany(userId, query)
      return {
        data: result.items,
        meta: {
          nextCursor: result.nextCursor,
          hasMore: result.hasMore,
          limit: query.limit,
        },
      }
    },

    async getSessionById(id: string, userId: string) {
      const session = await repository.findById(id, userId)
      if (!session) throw new NotFoundError('StudySession', id)
      return session
    },

    async createSession(userId: string, data: CreateStudySession) {
      validateSessionTimes(data.startedAt, data.endedAt)
      const durationMinutes = computeDurationMinutes(data.startedAt, data.endedAt)
      return repository.create(userId, { ...data, durationMinutes })
    },

    async updateSession(id: string, userId: string, data: UpdateStudySession) {
      const existing = await repository.findById(id, userId)
      if (!existing) throw new NotFoundError('StudySession', id)

      const startedAt = data.startedAt ?? existing.startedAt.toISOString()
      const endedAt = data.endedAt ?? existing.endedAt.toISOString()

      if (data.startedAt ?? data.endedAt) {
        validateSessionTimes(startedAt, endedAt)
      }

      const updateData: UpdateStudySession & { durationMinutes?: number } = { ...data }
      if (data.startedAt ?? data.endedAt) {
        updateData.durationMinutes = computeDurationMinutes(startedAt, endedAt)
      }

      return repository.update(id, userId, updateData)
    },

    async deleteSession(id: string, userId: string) {
      const existing = await repository.findById(id, userId)
      if (!existing) throw new NotFoundError('StudySession', id)
      await repository.delete(id, userId)
    },
  }
}

export type SessionService = ReturnType<typeof createSessionService>
