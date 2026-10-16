import type { SessionRepository } from './session.repository.js'
import type { StreakReader } from '../calendar/calendar.service.js'
import type {
  CreateStudySession,
  UpdateStudySession,
  ListStudySessionsQuery,
} from '@lingopath/types'
import { NotFoundError, ValidationError } from '../../shared/errors.js'

// Business rule: session must not exceed 16 hours (protection against timer bugs)
const MAX_SESSION_MINUTES = 16 * 60

/** Documented lower bound: a session is at least one minute of real study time. */
const MIN_SESSION_MS = 60_000

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

  // The minimum is applied to the *elapsed time*, not to the rounded minutes:
  // otherwise a 30-second session rounds up to a full recorded minute.
  const elapsedMs = end.getTime() - start.getTime()
  if (elapsedMs < MIN_SESSION_MS) {
    throw new ValidationError('Session duration must be at least 1 minute')
  }

  const durationMinutes = computeDurationMinutes(startedAt, endedAt)
  if (durationMinutes > MAX_SESSION_MINUTES) {
    throw new ValidationError(
      `Session duration cannot exceed ${MAX_SESSION_MINUTES} minutes (16 hours)`,
    )
  }
}

/**
 * Validates the plan/milestone attribution of a session.
 *
 * `planId` and `milestoneId` are two independent nullable columns, so without
 * this check a session can be attributed to a milestone of a *different* plan —
 * which made one session count toward two plans. The rule enforced here: the
 * milestone must belong to a plan owned by the user, the explicit plan (when
 * given) must be that same plan, and a milestone-only session inherits the plan
 * so every "belongs to plan P" query agrees.
 */
async function resolveAttribution(
  repository: SessionRepository,
  userId: string,
  planId: string | null | undefined,
  milestoneId: string | null | undefined,
): Promise<{ planId?: string; milestoneId?: string }> {
  if (milestoneId) {
    const milestone = await repository.findMilestoneById(milestoneId)
    if (!milestone || milestone.plan.userId !== userId) {
      throw new ValidationError(`Milestone '${milestoneId}' not found`)
    }
    if (planId && planId !== milestone.planId) {
      throw new ValidationError('milestoneId does not belong to the given planId')
    }
    return { planId: milestone.planId, milestoneId }
  }

  if (planId) {
    const plan = await repository.findPlanById(planId, userId)
    if (!plan) {
      throw new ValidationError(`Plan '${planId}' not found`)
    }
  }

  // Nothing to override: keep whatever the caller provided (undefined = untouched).
  return {}
}

export interface SessionServiceDeps {
  /**
   * Canonical streak reader (Phase 7). Injected rather than reimplemented: the
   * calendar module owns the only streak rules and day-boundary arithmetic in
   * the codebase, and `StudySession` stays the only place study time lives.
   */
  getStreak: StreakReader
}

export function createSessionService(repository: SessionRepository, deps: SessionServiceDeps) {
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

    async getTodayStats(userId: string, timezone: string) {
      const [{ todaySessions, totalMinutes }, streak] = await Promise.all([
        repository.getTodayStats(userId, timezone),
        deps.getStreak(userId, timezone),
      ])

      // Default daily target: 60 minutes (would come from user's active DAILY goal)
      const dailyTargetMinutes = 60
      const remainingMinutes = Math.max(0, dailyTargetMinutes - totalMinutes)

      return {
        todayTotalMinutes: totalMinutes,
        dailyTargetMinutes,
        remainingMinutes,
        streak: streak.currentStreak,
        longestStreak: streak.longestStreak,
        streakQualifyingMinutes: streak.qualifyingMinutes,
        todayQualified: streak.todayQualified,
        todayPending: streak.todayPending,
        minutesToQualifyToday: streak.minutesToQualifyToday,
        sessions: todaySessions,
      }
    },

    async getSessionById(id: string, userId: string) {
      const session = await repository.findById(id, userId)
      if (!session) throw new NotFoundError('StudySession', id)
      return session
    },

    async createSession(userId: string, data: CreateStudySession) {
      validateSessionTimes(data.startedAt, data.endedAt)
      const attribution = await resolveAttribution(
        repository,
        userId,
        data.planId,
        data.milestoneId,
      )
      const durationMinutes = computeDurationMinutes(data.startedAt, data.endedAt)

      return repository.create(userId, { ...data, ...attribution, durationMinutes })
    },

    async updateSession(id: string, userId: string, data: UpdateStudySession) {
      const existing = await repository.findById(id, userId)
      if (!existing) throw new NotFoundError('StudySession', id)

      const startedAt = data.startedAt ?? existing.startedAt.toISOString()
      const endedAt = data.endedAt ?? existing.endedAt.toISOString()

      if (data.startedAt ?? data.endedAt) {
        validateSessionTimes(startedAt, endedAt)
      }

      // Attribution is validated against the effective (post-update) pair, but
      // only when the caller actually touches it: legacy rows that predate this
      // rule must stay editable.
      const attributionChanged = data.planId !== undefined || data.milestoneId !== undefined
      const attribution = attributionChanged
        ? await resolveAttribution(
            repository,
            userId,
            data.planId !== undefined ? data.planId : existing.planId,
            data.milestoneId !== undefined ? data.milestoneId : existing.milestoneId,
          )
        : {}

      const updateData: UpdateStudySession & { durationMinutes?: number } = {
        ...data,
        ...attribution,
      }
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
