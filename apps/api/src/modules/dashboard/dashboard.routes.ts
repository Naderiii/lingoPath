import type { FastifyPluginAsync } from 'fastify'
import { createDashboardRepository, createDashboardService } from './dashboard.service.js'
import { resolveUserTimeZone, resolveUserId } from '../../shared/current-user.js'

const dashboardRoutes: FastifyPluginAsync = async (fastify) => {
  const repository = createDashboardRepository(fastify.prisma)
  const service = createDashboardService(repository)

  // GET /api/v1/dashboard - consolidated dashboard payload
  fastify.get('/', async (request, reply) => {
    const userId = resolveUserId(request)
    const timezone = await resolveUserTimeZone(fastify.prisma, userId)
    const dashboard = await service.getDashboard(userId, timezone)

    return reply.send(dashboard)
  })
}

export default dashboardRoutes
