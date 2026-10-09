import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import { config } from './config.js'
import errorHandlerPlugin from './plugins/error-handler.js'
import prismaPlugin from './plugins/prisma.js'
import healthRoutes from './modules/health/health.routes.js'
import skillRoutes from './modules/skills/skill.routes.js'
import sessionRoutes from './modules/sessions/session.routes.js'

export async function buildApp() {
  const loggerConfig =
    config.NODE_ENV === 'development'
      ? {
          level: config.LOG_LEVEL,
          transport: {
            target: 'pino-pretty',
            options: { colorize: true, translateTime: 'HH:MM:ss' },
          },
        }
      : {
          level: config.LOG_LEVEL,
        }

  const app = Fastify({
    logger: loggerConfig,
    ajv: {
      customOptions: {
        allErrors: true,
      },
    },
  })

  // ─── Security ───────────────────────────────────────────────────────────────
  await app.register(helmet, {
    contentSecurityPolicy: false, // Disabled: API-only server, no HTML
  })

  await app.register(cors, {
    origin: config.CORS_ORIGIN,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })

  // ─── Plugins ────────────────────────────────────────────────────────────────
  await app.register(errorHandlerPlugin)
  await app.register(prismaPlugin)

  // ─── Routes ─────────────────────────────────────────────────────────────────
  // Health check (outside versioned prefix for load-balancer compatibility)
  await app.register(healthRoutes)

  // v1 API routes
  await app.register(
    async (v1) => {
      await v1.register(skillRoutes)
      await v1.register(sessionRoutes)
    },
    { prefix: '/api/v1' },
  )

  return app
}
