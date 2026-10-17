import type { FastifyInstance } from 'fastify'
import { createObjectiveRepository } from './objective.repository.js'
import { createObjectiveService } from './objective.service.js'
import {
  CreateLearningObjectiveSchema,
  SetActiveObjectiveSchema,
  UpdateLearningObjectiveSchema,
} from '@lingopath/types'
import { resolveUserTimeZone, resolveUserId } from '../../shared/current-user.js'

export default async function objectiveRoutes(app: FastifyInstance) {
  const objectiveService = createObjectiveService(createObjectiveRepository(app.prisma))

  // The active objective's target countdown is resolved in the user's timezone.
  const resolveTimeZone = (userId: string) => resolveUserTimeZone(app.prisma, userId)

  // GET /api/v1/objectives
  app.get('/objectives', async (request, _reply) => {
    const objectives = await objectiveService.listObjectives(resolveUserId(request))
    return { data: objectives }
  })

  // GET /api/v1/objectives/active — the current focus plus its factual signals.
  // Registered before `/:id` so the static path always wins over the parameter.
  app.get('/objectives/active', async (request, _reply) => {
    const userId = resolveUserId(request)
    return objectiveService.getActiveObjective(userId, await resolveTimeZone(userId))
  })

  // PUT /api/v1/objectives/active — designate or clear the focus.
  app.put('/objectives/active', async (request, _reply) => {
    const body = SetActiveObjectiveSchema.parse(request.body)
    const userId = resolveUserId(request)

    return objectiveService.setActiveObjective(
      userId,
      body.objectiveId,
      await resolveTimeZone(userId),
    )
  })

  // GET /api/v1/objectives/:id
  app.get<{ Params: { id: string } }>('/objectives/:id', async (request, _reply) => {
    return objectiveService.getObjectiveById(request.params.id, resolveUserId(request))
  })

  // POST /api/v1/objectives
  app.post('/objectives', async (request, reply) => {
    const body = CreateLearningObjectiveSchema.parse(request.body)
    const objective = await objectiveService.createObjective(resolveUserId(request), body)
    return reply.status(201).send(objective)
  })

  // PUT /api/v1/objectives/:id
  app.put<{ Params: { id: string } }>('/objectives/:id', async (request, _reply) => {
    const body = UpdateLearningObjectiveSchema.parse(request.body)
    return objectiveService.updateObjective(request.params.id, resolveUserId(request), body)
  })

  // DELETE /api/v1/objectives/:id
  app.delete<{ Params: { id: string } }>('/objectives/:id', async (request, reply) => {
    await objectiveService.deleteObjective(request.params.id, resolveUserId(request))
    return reply.status(204).send()
  })
}
