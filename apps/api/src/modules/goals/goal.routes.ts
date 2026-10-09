import type { FastifyInstance } from 'fastify'
import { createGoalRepository } from './goal.repository.js'
import { createGoalService } from './goal.service.js'
import { ListGoalsQuerySchema, CreateGoalSchema, UpdateGoalSchema } from '@lingopath/types'

const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001'

export default async function goalRoutes(app: FastifyInstance) {
  const goalService = createGoalService(createGoalRepository(app.prisma))

  // GET /api/v1/goals
  app.get('/goals', async (request, _reply) => {
    const query = ListGoalsQuerySchema.parse(request.query)
    return goalService.listGoals(DEFAULT_USER_ID, query)
  })

  // GET /api/v1/goals/:id
  app.get<{ Params: { id: string } }>('/goals/:id', async (request, _reply) => {
    return goalService.getGoalById(request.params.id, DEFAULT_USER_ID)
  })

  // POST /api/v1/goals
  app.post('/goals', async (request, reply) => {
    const body = CreateGoalSchema.parse(request.body)
    const goal = await goalService.createGoal(DEFAULT_USER_ID, body)
    return reply.status(201).send(goal)
  })

  // PUT /api/v1/goals/:id
  app.put<{ Params: { id: string } }>('/goals/:id', async (request, _reply) => {
    const body = UpdateGoalSchema.parse(request.body)
    return goalService.updateGoal(request.params.id, DEFAULT_USER_ID, body)
  })

  // DELETE /api/v1/goals/:id
  app.delete<{ Params: { id: string } }>('/goals/:id', async (request, reply) => {
    await goalService.deleteGoal(request.params.id, DEFAULT_USER_ID)
    return reply.status(204).send()
  })
}
