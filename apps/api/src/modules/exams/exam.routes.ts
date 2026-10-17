import type { FastifyInstance } from 'fastify'
import { createExamRepository } from './exam.repository.js'
import { createExamService } from './exam.service.js'
import {
  ListExamsQuerySchema,
  CreateExamSchema,
  UpdateExamSchema,
  CreateExamResultSchema,
} from '@lingopath/types'
import { resolveUserId } from '../../shared/current-user.js'

export default async function examRoutes(app: FastifyInstance) {
  const examService = createExamService(createExamRepository(app.prisma))

  // GET /api/v1/exams/scales — the scales a client may choose from, plus each exam
  // type's default. Registered before `/:id` so the static path always wins.
  app.get('/exams/scales', async (_request, _reply) => {
    return examService.listScales()
  })

  // GET /api/v1/exams
  app.get('/exams', async (request, _reply) => {
    const query = ListExamsQuerySchema.parse(request.query)
    return examService.listExams(resolveUserId(request), query)
  })

  // GET /api/v1/exams/:id
  app.get<{ Params: { id: string } }>('/exams/:id', async (request, _reply) => {
    return examService.getExamById(request.params.id, resolveUserId(request))
  })

  // POST /api/v1/exams
  app.post('/exams', async (request, reply) => {
    const body = CreateExamSchema.parse(request.body)
    const exam = await examService.createExam(resolveUserId(request), body)
    return reply.status(201).send(exam)
  })

  // PUT /api/v1/exams/:id
  app.put<{ Params: { id: string } }>('/exams/:id', async (request, _reply) => {
    const body = UpdateExamSchema.parse(request.body)
    return examService.updateExam(request.params.id, resolveUserId(request), body)
  })

  // PATCH /api/v1/exams/:id — identical semantics to PUT for this resource
  app.patch<{ Params: { id: string } }>('/exams/:id', async (request, _reply) => {
    const body = UpdateExamSchema.parse(request.body)
    return examService.updateExam(request.params.id, resolveUserId(request), body)
  })

  // DELETE /api/v1/exams/:id
  app.delete<{ Params: { id: string } }>('/exams/:id', async (request, reply) => {
    await examService.deleteExam(request.params.id, resolveUserId(request))
    return reply.status(204).send()
  })

  // ─── Exam Results ──────────────────────────────────────────────────────────

  // POST /api/v1/exams/:id/results
  app.post<{ Params: { id: string } }>('/exams/:id/results', async (request, reply) => {
    const body = CreateExamResultSchema.parse(request.body)
    const result = await examService.addExamResult(
      request.params.id,
      resolveUserId(request),
      body,
    )
    return reply.status(201).send(result)
  })

  // GET /api/v1/exams/:id/results
  app.get<{ Params: { id: string } }>('/exams/:id/results', async (request, _reply) => {
    const results = await examService.getExamResults(request.params.id, resolveUserId(request))
    return { data: results }
  })
}
