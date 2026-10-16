import type { FastifyInstance } from 'fastify'
import { createPlanRepository } from './plan.repository.js'
import { createPlanService } from './plan.service.js'
import { resolveUserId } from '../../shared/current-user.js'
import {
  ListPlansQuerySchema,
  CreateLongTermPlanSchema,
  UpdateLongTermPlanSchema,
  CreatePlanMilestoneSchema,
  UpdatePlanMilestoneSchema,
} from '@lingopath/types'

export default async function planRoutes(app: FastifyInstance) {
  const planService = createPlanService(createPlanRepository(app.prisma))

  // GET /api/v1/plans
  app.get('/plans', async (request, _reply) => {
    const query = ListPlansQuerySchema.parse(request.query)
    return planService.listPlans(resolveUserId(request), query)
  })

  // GET /api/v1/plans/:id
  app.get<{ Params: { id: string } }>('/plans/:id', async (request, _reply) => {
    return planService.getPlanById(request.params.id, resolveUserId(request))
  })

  // GET /api/v1/plans/:id/progress — consolidated detail with progress from StudySession data
  app.get<{ Params: { id: string } }>('/plans/:id/progress', async (request, _reply) => {
    return planService.getPlanProgress(request.params.id, resolveUserId(request))
  })

  // POST /api/v1/plans
  app.post('/plans', async (request, reply) => {
    const body = CreateLongTermPlanSchema.parse(request.body)
    const plan = await planService.createPlan(resolveUserId(request), body)
    return reply.status(201).send(plan)
  })

  // PUT /api/v1/plans/:id
  app.put<{ Params: { id: string } }>('/plans/:id', async (request, _reply) => {
    const body = UpdateLongTermPlanSchema.parse(request.body)
    return planService.updatePlan(request.params.id, resolveUserId(request), body)
  })

  // PATCH /api/v1/plans/:id
  app.patch<{ Params: { id: string } }>('/plans/:id', async (request, _reply) => {
    const body = UpdateLongTermPlanSchema.parse(request.body)
    return planService.updatePlan(request.params.id, resolveUserId(request), body)
  })

  // DELETE /api/v1/plans/:id
  app.delete<{ Params: { id: string } }>('/plans/:id', async (request, reply) => {
    await planService.deletePlan(request.params.id, resolveUserId(request))
    return reply.status(204).send()
  })

  // ─── Milestones ────────────────────────────────────────────────────────────

  // GET /api/v1/plans/:planId/milestones
  app.get<{ Params: { planId: string } }>('/plans/:planId/milestones', async (request, _reply) => {
    return planService.listMilestones(request.params.planId, resolveUserId(request))
  })

  // POST /api/v1/plans/:planId/milestones
  app.post<{ Params: { planId: string } }>('/plans/:planId/milestones', async (request, reply) => {
    const body = CreatePlanMilestoneSchema.parse(request.body)
    const milestone = await planService.createMilestone(
      request.params.planId,
      resolveUserId(request),
      body,
    )
    return reply.status(201).send(milestone)
  })

  // PUT /api/v1/milestones/:id
  app.put<{ Params: { id: string } }>('/milestones/:id', async (request, _reply) => {
    const body = UpdatePlanMilestoneSchema.parse(request.body)
    return planService.updateMilestone(request.params.id, resolveUserId(request), body)
  })

  // PATCH /api/v1/milestones/:id
  app.patch<{ Params: { id: string } }>('/milestones/:id', async (request, _reply) => {
    const body = UpdatePlanMilestoneSchema.parse(request.body)
    return planService.updateMilestone(request.params.id, resolveUserId(request), body)
  })

  // DELETE /api/v1/milestones/:id
  app.delete<{ Params: { id: string } }>('/milestones/:id', async (request, reply) => {
    await planService.deleteMilestone(request.params.id, resolveUserId(request))
    return reply.status(204).send()
  })
}
