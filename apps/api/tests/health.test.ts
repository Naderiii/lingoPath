import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify from 'fastify'
import healthRoutes from '../src/modules/health/health.routes.js'
import errorHandlerPlugin from '../src/plugins/error-handler.js'

// Health check test does NOT require a database connection.
// We build a minimal Fastify instance with only the health route registered.
describe('Health endpoint', () => {
  const app = Fastify({ logger: false })

  beforeAll(async () => {
    await app.register(errorHandlerPlugin)
    await app.register(healthRoutes)
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('GET /api/health returns 200 with { status: "ok" }', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: 'ok' })
  })
})
