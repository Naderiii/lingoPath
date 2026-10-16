import type { FastifyPluginAsync } from 'fastify'
import { resolveUserTimeZone, resolveUserId } from '../../shared/current-user.js'
import { AnalyticsQuerySchema } from './analytics.schemas.js'
import { createAnalyticsRepository } from './analytics.repository.js'
import { createAnalyticsService } from './analytics.service.js'
import { createPrismaStreakReader } from '../calendar/calendar.service.js'

/**
 * Analytics (Phase 8).
 *
 * One consolidated endpoint for the `/analytics` page: study-time summary,
 * skill breakdown, time trends, period comparison, and long-term plan analytics.
 * All numbers are derived from `StudySession` rows through SQL-side aggregation;
 * streaks, goal progress and plan progress are delegated to their owning modules
 * so nothing is redefined here.
 */
const analyticsRoutes: FastifyPluginAsync = async (fastify) => {
  const service = createAnalyticsService(createAnalyticsRepository(fastify.prisma), {
    getStreak: createPrismaStreakReader(fastify.prisma),
  })

  // GET /api/v1/analytics?range=30d&timezone=Europe/Berlin
  // GET /api/v1/analytics?range=custom&from=2026-01-01&to=2026-03-31
  fastify.get('/analytics', async (request, reply) => {
    const query = AnalyticsQuerySchema.parse(request.query)
    const userId = resolveUserId(request)

    const timeZone = query.timezone ?? (await resolveUserTimeZone(fastify.prisma, userId))

    const payload = await service.getAnalytics(userId, {
      range: query.range,
      ...(query.from !== undefined ? { from: query.from } : {}),
      ...(query.to !== undefined ? { to: query.to } : {}),
      timeZone,
    })

    return reply.send(payload)
  })
}

export default analyticsRoutes
