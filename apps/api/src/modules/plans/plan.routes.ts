import type { FastifyInstance } from 'fastify'
import { createPlanRepository } from './plan.repository.js'
import { createPlanService } from './plan.service.js'
import {
  ListPlansQuerySchema,
  CreateLongTermPlanSchema,
  UpdateLongTermPlanSchema,
  CreatePlanMilestoneSchema,
  UpdatePlanMilestoneSchema,
} from '@lingopath/types'

const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001'

export default async function planRoutes(app: FastifyInstance) {
  const planService = createPlanService(createPlanRepository(app.prisma))

  // GET /api/v1/plans
  app.get('/plans', async (request, _reply) => {
    const query = ListPlansQuerySchema.parse(request.query)
    return planService.listPlans(DEFAULT_USER_ID, query)
  })

  // GET /api/v1/plans/:id
  app.get<{ Params: { id: string } }>('/plans/:id', async (request, _reply) => {
    return planService.getPlanById(request.params.id, DEFAULT_USER_ID)
  })

  // POST /api/v1/plans
  app.post('/plans', async (request, reply) => {
    const body = CreateLongTermPlanSchema.parse(request.body)
    const plan = await planService.createPlan(DEFAULT_USER_ID, body)
    return reply.status(201).send(plan)
  })

  // PUT /api/v1/plans/:id
  app.put<{ Params: { id: string } }>('/plans/:id', async (request, _reply) => {
    const body = UpdateLongTermPlanSchema.parse(request.body)
    return planService.updatePlan(request.params.id, DEFAULT_USER_ID, body)
  })

  // DELETE /api/v1/plans/:id
  app.delete<{ Params: { id: string } }>('/plans/:id', async (request, reply) => {
    await planService.deletePlan(request.params.id, DEFAULT_USER_ID)
    return reply.status(204).send()
  })

  // ─── Milestones ────────────────────────────────────────────────────────────

  // POST /api/v1/plans/:planId/milestones
  app.post<{ Params: { planId: string } }>('/plans/:planId/milestones', async (request, reply) => {
    const body = CreatePlanMilestoneSchema.parse(request.body)
    const milestone = await planService.createMilestone(
      request.params.planId,
      DEFAULT_USER_ID,
      body,
    )
    return reply.status(201).send(milestone)
  })

  // PUT /api/v1/milestones/:id
  app.put<{ Params: { id: string } }>('/milestones/:id', async (request, _reply) => {
    const body = UpdatePlanMilestoneSchema.parse(request.body)
    return planService.updateMilestone(request.params.id, DEFAULT_USER_ID, body)
  })

  // DELETE /api/v1/milestones/:id
  app.delete<{ Params: { id: string } }>('/milestones/:id', async (request, reply) => {
    await planService.deleteMilestone(request.params.id, DEFAULT_USER_ID)
    return reply.status(204).send()
  })
}
