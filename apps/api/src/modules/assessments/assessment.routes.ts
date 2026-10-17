import type { FastifyInstance } from 'fastify'
import { createAssessmentRepository } from './assessment.repository.js'
import { createAssessmentService } from './assessment.service.js'
import {
  ListLevelAssessmentsQuerySchema,
  CreateLevelAssessmentSchema,
  UpdateLevelAssessmentSchema,
} from '@lingopath/types'
import { resolveUserTimeZone, resolveUserId } from '../../shared/current-user.js'

export default async function assessmentRoutes(app: FastifyInstance) {
  const assessmentService = createAssessmentService(createAssessmentRepository(app.prisma))

  // The user's configured timezone decides which calendar day "today" is on the
  // overview. The levels themselves are timezone-independent.
  const resolveTimeZone = (userId: string) => resolveUserTimeZone(app.prisma, userId)

  // GET /api/v1/assessments/overview — most recently recorded level per dimension.
  // Registered before `/:id` so the static path always wins over the parameter.
  app.get('/assessments/overview', async (request, _reply) => {
    const query = ListLevelAssessmentsQuerySchema.parse(request.query)
    const userId = resolveUserId(request)

    return assessmentService.getLevelOverview(userId, query, await resolveTimeZone(userId))
  })

  // GET /api/v1/assessments
  app.get('/assessments', async (request, _reply) => {
    const query = ListLevelAssessmentsQuerySchema.parse(request.query)
    return assessmentService.listAssessments(resolveUserId(request), query)
  })

  // GET /api/v1/assessments/:id
  app.get<{ Params: { id: string } }>('/assessments/:id', async (request, _reply) => {
    return assessmentService.getAssessmentById(request.params.id, resolveUserId(request))
  })

  // POST /api/v1/assessments
  app.post('/assessments', async (request, reply) => {
    const body = CreateLevelAssessmentSchema.parse(request.body)
    const assessment = await assessmentService.createAssessment(resolveUserId(request), body)
    return reply.status(201).send(assessment)
  })

  // PUT /api/v1/assessments/:id
  app.put<{ Params: { id: string } }>('/assessments/:id', async (request, _reply) => {
    const body = UpdateLevelAssessmentSchema.parse(request.body)
    return assessmentService.updateAssessment(request.params.id, resolveUserId(request), body)
  })

  // PATCH /api/v1/assessments/:id — identical semantics to PUT for this resource
  app.patch<{ Params: { id: string } }>('/assessments/:id', async (request, _reply) => {
    const body = UpdateLevelAssessmentSchema.parse(request.body)
    return assessmentService.updateAssessment(request.params.id, resolveUserId(request), body)
  })

  // DELETE /api/v1/assessments/:id
  app.delete<{ Params: { id: string } }>('/assessments/:id', async (request, reply) => {
    await assessmentService.deleteAssessment(request.params.id, resolveUserId(request))
    return reply.status(204).send()
  })
}
