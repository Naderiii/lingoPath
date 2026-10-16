import type { FastifyInstance } from 'fastify'
import { createGoalRepository } from './goal.repository.js'
import { createGoalService } from './goal.service.js'
import { ListGoalsQuerySchema, CreateGoalSchema, UpdateGoalSchema } from '@lingopath/types'
import { resolveUserTimeZone, resolveUserId } from '../../shared/current-user.js'

export default async function goalRoutes(app: FastifyInstance) {
  const goalService = createGoalService(createGoalRepository(app.prisma))

  // The user's configured timezone defines every period boundary (day, Monday
  // week, calendar month, calendar year) used by goal progress.
  const resolveTimeZone = (userId: string) => resolveUserTimeZone(app.prisma, userId)

  // GET /api/v1/goals
  app.get('/goals', async (request, _reply) => {
    const query = ListGoalsQuerySchema.parse(request.query)
    const includeProgress = (request.query as Record<string, unknown>).includeProgress === 'true'
    const userId = resolveUserId(request)

    if (includeProgress) {
      return goalService.listGoalsWithProgress(userId, query, await resolveTimeZone(userId))
    }
    return goalService.listGoals(userId, query)
  })

  // GET /api/v1/goals/:id
  app.get<{ Params: { id: string } }>('/goals/:id', async (request, _reply) => {
    const includeProgress = (request.query as Record<string, unknown>).includeProgress === 'true'
    const userId = resolveUserId(request)

    if (includeProgress) {
      return goalService.getGoalWithProgress(
        request.params.id,
        userId,
        await resolveTimeZone(userId),
      )
    }
    return goalService.getGoalById(request.params.id, userId)
  })

  // POST /api/v1/goals
  app.post('/goals', async (request, reply) => {
    const body = CreateGoalSchema.parse(request.body)
    const goal = await goalService.createGoal(resolveUserId(request), body)
    return reply.status(201).send(goal)
  })

  // PUT /api/v1/goals/:id
  app.put<{ Params: { id: string } }>('/goals/:id', async (request, _reply) => {
    const body = UpdateGoalSchema.parse(request.body)
    return goalService.updateGoal(request.params.id, resolveUserId(request), body)
  })

  // DELETE /api/v1/goals/:id
  app.delete<{ Params: { id: string } }>('/goals/:id', async (request, reply) => {
    await goalService.deleteGoal(request.params.id, resolveUserId(request))
    return reply.status(204).send()
  })
}
