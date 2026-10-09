import type { FastifyInstance } from 'fastify'
import { createAssessmentRepository } from './assessment.repository.js'
import { createAssessmentService } from './assessment.service.js'
import { ListLevelAssessmentsQuerySchema, CreateLevelAssessmentSchema } from '@lingopath/types'

const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001'

export default async function assessmentRoutes(app: FastifyInstance) {
  const assessmentService = createAssessmentService(createAssessmentRepository(app.prisma))

  // GET /api/v1/assessments
  app.get('/assessments', async (request, _reply) => {
    const query = ListLevelAssessmentsQuerySchema.parse(request.query)
    return assessmentService.listAssessments(DEFAULT_USER_ID, query)
  })

  // GET /api/v1/assessments/:id
  app.get<{ Params: { id: string } }>('/assessments/:id', async (request, _reply) => {
    return assessmentService.getAssessmentById(request.params.id, DEFAULT_USER_ID)
  })

  // POST /api/v1/assessments
  app.post('/assessments', async (request, reply) => {
    const body = CreateLevelAssessmentSchema.parse(request.body)
    const assessment = await assessmentService.createAssessment(DEFAULT_USER_ID, body)
    return reply.status(201).send(assessment)
  })

  // DELETE /api/v1/assessments/:id
  app.delete<{ Params: { id: string } }>('/assessments/:id', async (request, reply) => {
    await assessmentService.deleteAssessment(request.params.id, DEFAULT_USER_ID)
    return reply.status(204).send()
  })
}
