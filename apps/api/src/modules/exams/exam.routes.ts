import type { FastifyInstance } from 'fastify'
import { createExamRepository } from './exam.repository.js'
import { createExamService } from './exam.service.js'
import {
  ListExamsQuerySchema,
  CreateExamSchema,
  UpdateExamSchema,
  CreateExamResultSchema,
} from '@lingopath/types'

const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001'

export default async function examRoutes(app: FastifyInstance) {
  const examService = createExamService(createExamRepository(app.prisma))

  // GET /api/v1/exams
  app.get('/exams', async (request, _reply) => {
    const query = ListExamsQuerySchema.parse(request.query)
    return examService.listExams(DEFAULT_USER_ID, query)
  })

  // GET /api/v1/exams/:id
  app.get<{ Params: { id: string } }>('/exams/:id', async (request, _reply) => {
    return examService.getExamById(request.params.id, DEFAULT_USER_ID)
  })

  // POST /api/v1/exams
  app.post('/exams', async (request, reply) => {
    const body = CreateExamSchema.parse(request.body)
    const exam = await examService.createExam(DEFAULT_USER_ID, body)
    return reply.status(201).send(exam)
  })

  // PUT /api/v1/exams/:id
  app.put<{ Params: { id: string } }>('/exams/:id', async (request, _reply) => {
    const body = UpdateExamSchema.parse(request.body)
    return examService.updateExam(request.params.id, DEFAULT_USER_ID, body)
  })

  // DELETE /api/v1/exams/:id
  app.delete<{ Params: { id: string } }>('/exams/:id', async (request, reply) => {
    await examService.deleteExam(request.params.id, DEFAULT_USER_ID)
    return reply.status(204).send()
  })

  // ─── Exam Results ──────────────────────────────────────────────────────────

  // POST /api/v1/exams/:id/results
  app.post<{ Params: { id: string } }>('/exams/:id/results', async (request, reply) => {
    const body = CreateExamResultSchema.parse(request.body)
    const result = await examService.addExamResult(request.params.id, DEFAULT_USER_ID, body)
    return reply.status(201).send(result)
  })

  // GET /api/v1/exams/:id/results
  app.get<{ Params: { id: string } }>('/exams/:id/results', async (request, _reply) => {
    const results = await examService.getExamResults(request.params.id, DEFAULT_USER_ID)
    return { data: results }
  })
}
