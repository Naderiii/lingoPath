import type { FastifyPluginAsync } from 'fastify'
import { createDashboardRepository, createDashboardService } from './dashboard.service.js'

// Phase 1/2 - single user, identity resolved from config (consistent with all other routes)
const DEFAULT_USER_ID = '[CARD_REDACTED]-[CARD_REDACTED]'

const dashboardRoutes: FastifyPluginAsync = async (fastify) => {
  const repository = createDashboardRepository(fastify.prisma)
  const service = createDashboardService(repository)

  // GET /api/v1/dashboard - consolidated dashboard payload
  fastify.get('/', async (request, reply) => {
    // Resolve userId: header override for dev/testing, then DEFAULT_USER_ID
    const userId =
      (request.headers['x-user-id'] as string | undefined) ?? DEFAULT_USER_ID

    // Get user's configured timezone
    const user = await fastify.prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true },
    })

    const timezone = user?.timezone ?? 'UTC'
    const dashboard = await service.getDashboard(userId, timezone)

    return reply.send(dashboard)
  })
}

export default dashboardRoutes
