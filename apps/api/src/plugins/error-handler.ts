import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import { ZodError } from 'zod'
import { AppError } from '../shared/errors.js'

/**
 * Zod identity is not guaranteed across package boundaries.
 *
 * Validation schemas live in `@lingopath/types`, which has its own resolved copy
 * of `zod`. Under bundlers and test runners those imports can resolve to different
 * builds of the same version, and `instanceof ZodError` then returns false for a
 * perfectly valid `ZodError` — turning a 422 into a 500. Recognising the shape as
 * well as the class keeps validation errors reported as validation errors however
 * the dependency graph is flattened.
 */
function isZodError(error: unknown): error is ZodError {
  if (error instanceof ZodError) return true
  if (typeof error !== 'object' || error === null) return false

  const candidate = error as { name?: unknown; issues?: unknown; flatten?: unknown }
  return (
    candidate.name === 'ZodError' &&
    Array.isArray(candidate.issues) &&
    typeof candidate.flatten === 'function'
  )
}

async function errorHandlerPlugin(app: FastifyInstance) {
  app.setErrorHandler((error, request, reply) => {
    // Zod validation errors (from schema parsing in routes)
    if (isZodError(error)) {
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
