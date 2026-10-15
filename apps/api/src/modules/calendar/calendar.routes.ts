import type { FastifyPluginAsync } from 'fastify'
import { resolveUserId } from '../../shared/current-user.js'
import {
  CalendarDayParamsSchema,
  CalendarQuerySchema,
  CalendarSettingsQuerySchema,
  StreakQuerySchema,
  UpdateCalendarSettingsSchema,
} from './calendar.schemas.js'
import { createCalendarRepository } from './calendar.repository.js'
import { createCalendarService } from './calendar.service.js'

/**
 * Study calendar + streaks (Phase 7).
 *
 * Routes stay thin: validate, resolve identity, delegate, send. Thresholds and
 * the streak rule can be overridden per request (handy for previewing a scale)
 * or persisted through `PUT /calendar/settings`.
 */
const calendarRoutes: FastifyPluginAsync = async (fastify) => {
  const service = createCalendarService(createCalendarRepository(fastify.prisma))

  // GET /api/v1/calendar?year=2026 | ?from=2026-01-01&to=2026-03-31
  fastify.get('/calendar', async (request, reply) => {
    const query = CalendarQuerySchema.parse(request.query)

    const calendar = await service.getCalendar(resolveUserId(request), {
      ...(query.year !== undefined ? { year: query.year } : {}),
      ...(query.from !== undefined ? { from: query.from } : {}),
      ...(query.to !== undefined ? { to: query.to } : {}),
      ...(query.timezone !== undefined ? { timeZone: query.timezone } : {}),
      ...(query.intensityThresholds !== undefined
        ? { intensityThresholds: query.intensityThresholds }
        : {}),
      ...(query.streakQualifyingMinutes !== undefined
        ? { streakQualifyingMinutes: query.streakQualifyingMinutes }
        : {}),
    })

    return reply.send(calendar)
  })

  // GET /api/v1/calendar/settings
  fastify.get('/calendar/settings', async (request, reply) => {
    const query = CalendarSettingsQuerySchema.parse(request.query)

    const settings = await service.getSettings(resolveUserId(request), {
      ...(query.timezone !== undefined ? { timeZone: query.timezone } : {}),
    })

    return reply.send(settings)
  })

  // PUT /api/v1/calendar/settings
  fastify.put('/calendar/settings', async (request, reply) => {
    const body = UpdateCalendarSettingsSchema.parse(request.body)
    const settings = await service.updateSettings(resolveUserId(request), body)

    return reply.send(settings)
  })

  // GET /api/v1/calendar/day/2026-10-16
  fastify.get<{ Params: { date: string } }>('/calendar/day/:date', async (request, reply) => {
    const { date } = CalendarDayParamsSchema.parse(request.params)
    const query = CalendarQuerySchema.parse(request.query)

    const detail = await service.getDayDetail(resolveUserId(request), date, {
      ...(query.timezone !== undefined ? { timeZone: query.timezone } : {}),
      ...(query.intensityThresholds !== undefined
        ? { intensityThresholds: query.intensityThresholds }
        : {}),
      ...(query.streakQualifyingMinutes !== undefined
        ? { streakQualifyingMinutes: query.streakQualifyingMinutes }
        : {}),
    })

    return reply.send(detail)
  })

  // GET /api/v1/streak
  fastify.get('/streak', async (request, reply) => {
    const query = StreakQuerySchema.parse(request.query)

    const streak = await service.getStreak(resolveUserId(request), {
      ...(query.timezone !== undefined ? { timeZone: query.timezone } : {}),
      ...(query.streakQualifyingMinutes !== undefined
        ? { streakQualifyingMinutes: query.streakQualifyingMinutes }
        : {}),
    })

    return reply.send(streak)
  })
}

export default calendarRoutes
