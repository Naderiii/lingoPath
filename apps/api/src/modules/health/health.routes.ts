import type { FastifyInstance } from 'fastify'
import type { HealthResponse } from '@lingopath/types'

export default async function healthRoutes(app: FastifyInstance) {
  app.get<{ Reply: HealthResponse }>(
    '/api/health',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['ok'] },
            },
            required: ['status'],
          },
        },
      },
    },
    async (_request, _reply) => {
      return { status: 'ok' }
    },
  )
}
