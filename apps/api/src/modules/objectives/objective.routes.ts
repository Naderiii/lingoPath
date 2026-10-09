import type { FastifyInstance } from 'fastify'
import { createObjectiveRepository } from './objective.repository.js'
import { createObjectiveService } from './objective.service.js'
import { CreateLearningObjectiveSchema, UpdateLearningObjectiveSchema } from '@lingopath/types'

const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001'

export default async function objectiveRoutes(app: FastifyInstance) {
  const objectiveService = createObjectiveService(createObjectiveRepository(app.prisma))

  // GET /api/v1/objectives
  app.get('/objectives', async (_request, _reply) => {
    const objectives = await objectiveService.listObjectives(DEFAULT_USER_ID)
    return { data: objectives }
  })

  // GET /api/v1/objectives/:id
  app.get<{ Params: { id: string } }>('/objectives/:id', async (request, _reply) => {
    return objectiveService.getObjectiveById(request.params.id, DEFAULT_USER_ID)
  })

  // POST /api/v1/objectives
  app.post('/objectives', async (request, reply) => {
    const body = CreateLearningObjectiveSchema.parse(request.body)
    const objective = await objectiveService.createObjective(DEFAULT_USER_ID, body)
    return reply.status(201).send(objective)
  })

  // PUT /api/v1/objectives/:id
  app.put<{ Params: { id: string } }>('/objectives/:id', async (request, _reply) => {
    const body = UpdateLearningObjectiveSchema.parse(request.body)
    return objectiveService.updateObjective(request.params.id, DEFAULT_USER_ID, body)
  })

  // DELETE /api/v1/objectives/:id
  app.delete<{ Params: { id: string } }>('/objectives/:id', async (request, reply) => {
    await objectiveService.deleteObjective(request.params.id, DEFAULT_USER_ID)
    return reply.status(204).send()
  })
}
