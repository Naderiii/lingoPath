import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import { ZodError } from 'zod'
import { AppError } from '../shared/errors.js'

async function errorHandlerPlugin(app: FastifyInstance) {
  app.setErrorHandler((error, request, reply) => {
    // Zod validation errors (from schema parsing in routes)
    if (error instanceof ZodError) {
      return reply.status(422).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: error.flatten(),
        },
      })
    }

    // Application domain errors
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          ...(error.details !== undefined ? { details: error.details } : {}),
        },
      })
    }

    // Fastify-native validation errors (400 from route schema)
    if (error.statusCode === 400 && 'validation' in error) {
      return reply.status(400).send({
        error: {
          code: 'BAD_REQUEST',
          message: error.message,
        },
      })
    }

    // Unknown errors — log and return generic 500
    request.log.error({ err: error }, 'Unhandled error')
    return reply.status(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    })
  })

  // 404 handler
  app.setNotFoundHandler((request, reply) => {
    return reply.status(404).send({
      error: {
        code: 'NOT_FOUND',
        message: `Route ${request.method} ${request.url} not found`,
      },
    })
  })
}

export default fp(errorHandlerPlugin, { name: 'error-handler' })
