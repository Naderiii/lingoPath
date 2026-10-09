import type { FastifyInstance } from 'fastify'
import { createSessionRepository } from './session.repository.js'
import { createSessionService } from './session.service.js'
import {
  CreateStudySessionSchema,
  UpdateStudySessionSchema,
  ListStudySessionsQuerySchema,
} from '@lingopath/types'

// Phase 1: single user, identity resolved from config
const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001'

export default async function sessionRoutes(app: FastifyInstance) {
  const sessionService = createSessionService(createSessionRepository(app.prisma))

  // GET /api/v1/sessions
  app.get('/sessions', async (request, _reply) => {
    const query = ListStudySessionsQuerySchema.parse(request.query)
    return sessionService.listSessions(DEFAULT_USER_ID, query)
  })

  // GET /api/v1/sessions/:id
  app.get<{ Params: { id: string } }>('/sessions/:id', async (request, _reply) => {
    return sessionService.getSessionById(request.params.id, DEFAULT_USER_ID)
  })

  // POST /api/v1/sessions
  app.post('/sessions', async (request, reply) => {
    const body = CreateStudySessionSchema.parse(request.body)
    const session = await sessionService.createSession(DEFAULT_USER_ID, body)
    return reply.status(201).send(session)
  })

  // PUT /api/v1/sessions/:id
  app.put<{ Params: { id: string } }>('/sessions/:id', async (request, _reply) => {
    const body = UpdateStudySessionSchema.parse(request.body)
    return sessionService.updateSession(request.params.id, DEFAULT_USER_ID, body)
  })

  // DELETE /api/v1/sessions/:id
  app.delete<{ Params: { id: string } }>('/sessions/:id', async (request, reply) => {
    await sessionService.deleteSession(request.params.id, DEFAULT_USER_ID)
    return reply.status(204).send()
  })
}
