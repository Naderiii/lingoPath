import type { FastifyInstance } from 'fastify'
import { createSessionRepository } from './session.repository.js'
import { createSessionService } from './session.service.js'
import { createPrismaStreakReader } from '../calendar/calendar.service.js'
import { resolveUserTimeZone, resolveUserId } from '../../shared/current-user.js'
import {
  CreateStudySessionSchema,
  UpdateStudySessionSchema,
  ListStudySessionsQuerySchema,
} from '@lingopath/types'

export default async function sessionRoutes(app: FastifyInstance) {
  const sessionService = createSessionService(createSessionRepository(app.prisma), {
    getStreak: createPrismaStreakReader(app.prisma),
  })

  // The user's configured timezone drives every day boundary on this route.
  const resolveTimeZone = (userId: string) => resolveUserTimeZone(app.prisma, userId)

  // GET /api/v1/sessions/today-stats
  app.get('/sessions/today-stats', async (request, _reply) => {
    const userId = resolveUserId(request)
    return sessionService.getTodayStats(userId, await resolveTimeZone(userId))
  })

  // GET /api/v1/sessions
  app.get('/sessions', async (request, _reply) => {
    const query = ListStudySessionsQuerySchema.parse(request.query)
    return sessionService.listSessions(resolveUserId(request), query)
  })

  // GET /api/v1/sessions/:id
  app.get<{ Params: { id: string } }>('/sessions/:id', async (request, _reply) => {
    return sessionService.getSessionById(request.params.id, resolveUserId(request))
  })

  // POST /api/v1/sessions
  app.post('/sessions', async (request, reply) => {
    const body = CreateStudySessionSchema.parse(request.body)
    const session = await sessionService.createSession(resolveUserId(request), body)
    return reply.status(201).send(session)
  })

  // PUT /api/v1/sessions/:id
  app.put<{ Params: { id: string } }>('/sessions/:id', async (request, _reply) => {
    const body = UpdateStudySessionSchema.parse(request.body)
    return sessionService.updateSession(request.params.id, resolveUserId(request), body)
  })

  // DELETE /api/v1/sessions/:id
  app.delete<{ Params: { id: string } }>('/sessions/:id', async (request, reply) => {
    await sessionService.deleteSession(request.params.id, resolveUserId(request))
    return reply.status(204).send()
  })
}
