import type { PrismaClient } from '@prisma/client'
import type {
  CalendarDayDetailResponse,
  CalendarDaySession,
  CalendarRange,
  CalendarResponse,
  CalendarSettingsResponse,
  StreakSummaryResponse,
} from '@lingopath/types'
import { DEFAULT_TIMEZONE } from '../../shared/current-user.js'
import { ValidationError } from '../../shared/errors.js'
import {
  dayBoundsUtc,
  diffDayKeys,
  endOfDayUtcExclusive,
  enumerateDayKeys,
  getDayKey,
  getDayKeyYear,
  getLocalTimeLabel,
  isDayKey,
  isValidTimeZone,
  startOfDayUtc,
  startOfYearDayKey,
  endOfYearDayKey,
} from '../../shared/timezone.js'
import {
  aggregateSessionsByDay,
  buildCalendarDays,
  buildDayBreakdowns,
  computeStreakSummaryFromSessions,
  describeIntensityLevels,
  normalizeIntensityThresholds,
  normalizeQualifyingMinutes,
  resolveIntensityLevel,
  isQualifyingDay,
  summarizeCalendarRange,
} from './calendar.domain.js'
import type { CalendarRepository } from './calendar.repository.js'
import { createCalendarRepository } from './calendar.repository.js'

/**
 * The one way to ask "how long is this user's streak?".
 *
 * The calendar endpoints, `/sessions/today-stats` and the dashboard all receive a
 * reader built from this factory, so no module can grow its own streak rules or
 * its own day-boundary arithmetic.
 */
export type StreakReader = (
  userId: string,
  timeZone: string,
  qualifyingMinutes?: number,
) => Promise<StreakSummaryResponse>

/** Two years including a leap day — generous enough for year-over-year views. */
export const MAX_CALENDAR_RANGE_DAYS = 731

export interface CalendarRequestOptions {
  /** Optional `?timezone=` override; falls back to the user's stored timezone. */
  timeZone?: string
  /** Optional per-request bucket override, e.g. `?intensityThresholds=15,30,60,120`. */
  intensityThresholds?: number[]
  /** Optional per-request streak rule, e.g. `?streakQualifyingMinutes=30`. */
  streakQualifyingMinutes?: number
}

export interface CalendarRangeRequest extends CalendarRequestOptions {
  year?: number
  from?: string
  to?: string
}

/** `GET /streak` accepts the same overrides as the rest of the calendar surface. */
export type StreakRequestOptions = CalendarRequestOptions

export interface CalendarServiceOptions {
  /** Injectable clock so range resolution and streaks are testable. */
  now?: () => Date
}

export function createCalendarService(
  repository: CalendarRepository,
  options: CalendarServiceOptions = {},
) {
  const now = options.now ?? ((): Date => new Date())

  async function resolveTimeZone(userId: string, override?: string): Promise<string> {
    if (override !== undefined) {
      if (!isValidTimeZone(override)) {
        throw new ValidationError(`Unknown IANA timezone '${override}'`)
      }
      return override
    }

    const stored = await repository.getUserTimeZone(userId)
    return stored && isValidTimeZone(stored) ? stored : DEFAULT_TIMEZONE
  }

  interface ResolvedConfiguration {
    timezone: string
    intensityThresholds: number[]
    streakQualifyingMinutes: number
    settingsSource: 'USER' | 'DEFAULT'
    settingsUpdatedAt: Date | null
  }

  /**
   * Effective configuration = request override → stored preference → built-in
   * default. Nothing is written here; persistence only happens in
   * `updateSettings`.
   */
  async function resolveConfiguration(
    userId: string,
    request: CalendarRequestOptions,
  ): Promise<ResolvedConfiguration> {
    const [timezone, stored] = await Promise.all([
      resolveTimeZone(userId, request.timeZone),
      repository.getSettings(userId),
    ])

    return {
      timezone,
      intensityThresholds: normalizeIntensityThresholds(
        request.intensityThresholds ?? stored?.intensityThresholds,
      ),
      streakQualifyingMinutes: normalizeQualifyingMinutes(
        request.streakQualifyingMinutes ?? stored?.streakQualifyingMinutes,
      ),
      settingsSource: stored ? 'USER' : 'DEFAULT',
      settingsUpdatedAt: stored?.updatedAt ?? null,
    }
  }

  function resolveRange(request: CalendarRangeRequest, todayKey: string): CalendarRange {
    if (request.from !== undefined && request.to !== undefined) {
      const from = request.from
      const to = request.to

      if (!isDayKey(from) || !isDayKey(to)) {
        throw new ValidationError('`from` and `to` must be real dates formatted as YYYY-MM-DD')
      }
      if (diffDayKeys(from, to) < 0) {
        throw new ValidationError('`from` must not be after `to`')
      }
      if (diffDayKeys(from, to) + 1 > MAX_CALENDAR_RANGE_DAYS) {
        throw new ValidationError(`Custom ranges are limited to ${MAX_CALENDAR_RANGE_DAYS} days`)
      }

      return { kind: 'CUSTOM', from, to, year: null }
    }

    const todayYear = getDayKeyYear(todayKey)
    const year = request.year ?? todayYear

    return {
      kind:
        year === todayYear ? 'CURRENT_YEAR' : year === todayYear - 1 ? 'PREVIOUS_YEAR' : 'CUSTOM',
      from: startOfYearDayKey(year),
      to: endOfYearDayKey(year),
      year,
    }
  }

  async function getSettings(
    userId: string,
    request: Pick<CalendarRequestOptions, 'timeZone'> = {},
  ): Promise<CalendarSettingsResponse> {
    const timezone = await resolveTimeZone(userId, request.timeZone)
    const stored = await repository.getSettings(userId)
    const thresholds = normalizeIntensityThresholds(stored?.intensityThresholds)

    return {
      timezone,
      today: getDayKey(now(), timezone),
      intensityThresholds: thresholds,
      intensityLevels: describeIntensityLevels(thresholds),
      streakQualifyingMinutes: normalizeQualifyingMinutes(stored?.streakQualifyingMinutes),
      source: stored ? 'USER' : 'DEFAULT',
      updatedAt: stored?.updatedAt.toISOString() ?? null,
    }
  }

  /**
   * Current + longest streak, derived on every call from `StudySession` rows.
   * The whole history is scanned because the longest streak is an all-time fact;
   * see `CalendarRepository.listActivitySessions` for the reasoning.
   */
  async function getStreakSummary(
    userId: string,
    timeZone?: string,
    qualifyingMinutesOverride?: number,
  ): Promise<StreakSummaryResponse> {
    const timezone = await resolveTimeZone(userId, timeZone)
    const stored = await repository.getSettings(userId)
    const qualifyingMinutes = normalizeQualifyingMinutes(
      qualifyingMinutesOverride ?? stored?.streakQualifyingMinutes,
    )

    const todayKey = getDayKey(now(), timezone)
    const sessions = await repository.listActivitySessions(userId)

    const streak = computeStreakSummaryFromSessions({
      sessions,
      timeZone: timezone,
      todayKey,
      qualifyingMinutes,
    })

    return { timezone, qualifyingMinutes, today: todayKey, ...streak }
  }

  return {
    /**
     * Heatmap payload: one entry per day of the range, including zero-minute days
     * so the grid never has to guess about alignment.
     */
    async getCalendar(
      userId: string,
      request: CalendarRangeRequest = {},
    ): Promise<CalendarResponse> {
      const configuration = await resolveConfiguration(userId, request)
      const todayKey = getDayKey(now(), configuration.timezone)
      const range = resolveRange(request, todayKey)

      const sessions = await repository.listActivitySessionsBetween(
        userId,
        startOfDayUtc(range.from, configuration.timezone),
        endOfDayUtcExclusive(range.to, configuration.timezone),
      )

      const activity = aggregateSessionsByDay(sessions, configuration.timezone)
      const days = buildCalendarDays(
        enumerateDayKeys(range.from, range.to),
        activity,
        configuration.intensityThresholds,
        configuration.streakQualifyingMinutes,
      )

      return {
        range,
        timezone: configuration.timezone,
        intensityThresholds: configuration.intensityThresholds,
        maxIntensityLevel: configuration.intensityThresholds.length + 1,
        intensityLevels: describeIntensityLevels(configuration.intensityThresholds),
        streakQualifyingMinutes: configuration.streakQualifyingMinutes,
        today: todayKey,
        days,
        summary: summarizeCalendarRange(days),
      }
    },

    /** Everything that happened on one local day. */
    async getDayDetail(
      userId: string,
      dayKey: string,
      request: CalendarRequestOptions = {},
    ): Promise<CalendarDayDetailResponse> {
      if (!isDayKey(dayKey)) {
        throw new ValidationError(`Invalid date '${dayKey}' — expected a real YYYY-MM-DD date`)
      }

      const configuration = await resolveConfiguration(userId, request)
      const { start, end } = dayBoundsUtc(dayKey, configuration.timezone)
      const sessions = await repository.listSessionsBetween(userId, start, end)

      const totalMinutes = sessions.reduce((sum, session) => sum + session.durationMinutes, 0)
      const breakdowns = buildDayBreakdowns(sessions)

      const detailSessions: CalendarDaySession[] = sessions
        .map((session) => ({
          id: session.id,
          startedAt: session.startedAt.toISOString(),
          endedAt: session.endedAt.toISOString(),
          durationMinutes: session.durationMinutes,
          skillId: session.skillId,
          skillName: session.skill.name,
          categoryId: session.categoryId,
          categoryName: session.category?.name ?? null,
          topic: session.topic,
          description: session.description,
          notes: session.notes,
          selfRating: session.selfRating,
          isManual: session.isManual,
          planId: session.planId,
          planTitle: session.plan?.title ?? null,
          milestoneId: session.milestoneId,
          milestoneTitle: session.milestone?.title ?? null,
        }))
        .sort((a, b) => a.startedAt.localeCompare(b.startedAt))

      const startedTimes = sessions.map((session) => session.startedAt)
      const endedTimes = sessions.map((session) => session.endedAt)

      return {
        date: dayKey,
        timezone: configuration.timezone,
        totalMinutes,
        sessionCount: sessions.length,
        intensity: resolveIntensityLevel(totalMinutes, configuration.intensityThresholds),
        qualified: isQualifyingDay(totalMinutes, configuration.streakQualifyingMinutes),
        streakQualifyingMinutes: configuration.streakQualifyingMinutes,
        intensityThresholds: configuration.intensityThresholds,
        firstSessionLocalTime:
          startedTimes.length > 0
            ? getLocalTimeLabel(
                new Date(Math.min(...startedTimes.map((date) => date.getTime()))),
                configuration.timezone,
              )
            : null,
        lastSessionLocalTime:
          endedTimes.length > 0
            ? getLocalTimeLabel(
                new Date(Math.max(...endedTimes.map((date) => date.getTime()))),
                configuration.timezone,
              )
            : null,
        skills: breakdowns.skills,
        categories: breakdowns.categories,
        topics: breakdowns.topics,
        notes: sessions
          .filter((session) => (session.notes ?? '').trim().length > 0)
          .map((session) => ({
            sessionId: session.id,
            topic: session.topic,
            notes: session.notes!,
            durationMinutes: session.durationMinutes,
            startedAt: session.startedAt.toISOString(),
          }))
          .sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
        sessions: detailSessions,
      }
    },

    /**
     * Current + longest streak, derived on every call from `StudySession` rows.
     * The whole history is scanned because the longest streak is an all-time
     * fact; see `CalendarRepository.listActivitySessions` for the reasoning.
     */
    async getStreak(
      userId: string,
      request: StreakRequestOptions = {},
    ): Promise<StreakSummaryResponse> {
      return getStreakSummary(userId, request.timeZone, request.streakQualifyingMinutes)
    },

    async getSettings(
      userId: string,
      request: Pick<CalendarRequestOptions, 'timeZone'> = {},
    ): Promise<CalendarSettingsResponse> {
      return getSettings(userId, request)
    },

    /** Persists the user's calendar preferences and returns the effective config. */
    async updateSettings(
      userId: string,
      input: {
        intensityThresholds?: number[] | undefined
        streakQualifyingMinutes?: number | undefined
      },
    ): Promise<CalendarSettingsResponse> {
      await repository.upsertSettings(userId, {
        ...(input.intensityThresholds !== undefined
          ? { intensityThresholds: normalizeIntensityThresholds(input.intensityThresholds) }
          : {}),
        ...(input.streakQualifyingMinutes !== undefined
          ? { streakQualifyingMinutes: normalizeQualifyingMinutes(input.streakQualifyingMinutes) }
          : {}),
      })

      return getSettings(userId)
    },
  }
}

export type CalendarService = ReturnType<typeof createCalendarService>

/** Builds the canonical streak reader on top of a calendar repository. */
export function createStreakReader(
  repository: CalendarRepository,
  options: CalendarServiceOptions = {},
): StreakReader {
  const service = createCalendarService(repository, options)
  return (userId, timeZone, qualifyingMinutes) =>
    service.getStreak(userId, {
      timeZone,
      ...(qualifyingMinutes !== undefined ? { streakQualifyingMinutes: qualifyingMinutes } : {}),
    })
}

/**
 * Prisma-backed streak reader for modules that already hold a client — the
 * sessions module and the dashboard use this instead of querying their own.
 */
export function createPrismaStreakReader(
  prisma: PrismaClient,
  options: CalendarServiceOptions = {},
): StreakReader {
  return createStreakReader(createCalendarRepository(prisma), options)
}
