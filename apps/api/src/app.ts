import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import { config } from './config.js'
import errorHandlerPlugin from './plugins/error-handler.js'
import prismaPlugin from './plugins/prisma.js'
import healthRoutes from './modules/health/health.routes.js'
import skillRoutes from './modules/skills/skill.routes.js'
import sessionRoutes from './modules/sessions/session.routes.js'
import categoryRoutes from './modules/categories/category.routes.js'
import objectiveRoutes from './modules/objectives/objective.routes.js'
import planRoutes from './modules/plans/plan.routes.js'
import goalRoutes from './modules/goals/goal.routes.js'
import assessmentRoutes from './modules/assessments/assessment.routes.js'
import examRoutes from './modules/exams/exam.routes.js'
import dashboardRoutes from './modules/dashboard/dashboard.routes.js'
import calendarRoutes from './modules/calendar/calendar.routes.js'
import analyticsRoutes from './modules/analytics/analytics.routes.js'
import recommendationRoutes from './modules/recommendations/recommendation.routes.js'
import {
  createLlmAdapterFromEnvironment,
  type LlmAdapter,
} from './modules/recommendations/recommendation.llm.js'

export interface BuildAppOptions {
  /**
   * Overrides the configured language model adapter (tests inject a stub; the
   * default is built from `LLM_*` configuration). Recommendation generation works
   * either way — without a provider it falls back to deterministic wording.
   */
  recommendationLlm?: LlmAdapter
}

export async function buildApp(options: BuildAppOptions = {}) {
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
    // `x-user-id` is the documented dev/testing identity override; browsers need
    // it in the allow-list for the override to be usable at all.
    allowedHeaders: ['Content-Type', 'Authorization', 'x-user-id'],
    credentials: true,
  })

  // ─── Plugins ────────────────────────────────────────────────────────────────
  await app.register(errorHandlerPlugin)
  await app.register(prismaPlugin)

  // The provider is chosen once, here. Modules below never see configuration and
  // never see a vendor's request shape.
  const recommendationLlm = options.recommendationLlm ?? createLlmAdapterFromEnvironment(config)

  // ─── Routes ─────────────────────────────────────────────────────────────────
  // Health check (outside versioned prefix for load-balancer compatibility)
  await app.register(healthRoutes)

  // v1 API routes
  await app.register(
    async (v1) => {
      await v1.register(skillRoutes)
      await v1.register(sessionRoutes)
      await v1.register(categoryRoutes)
      await v1.register(objectiveRoutes)
      await v1.register(planRoutes)
      await v1.register(goalRoutes)
      await v1.register(assessmentRoutes)
      await v1.register(examRoutes)
      await v1.register(dashboardRoutes, { prefix: '/dashboard' })
      await v1.register(calendarRoutes)
      await v1.register(analyticsRoutes)
      await v1.register(recommendationRoutes, {
        llmAdapter: recommendationLlm,
        maxCandidates: config.RECOMMENDATION_MAX_ITEMS,
      })
    },
    { prefix: '/api/v1' },
  )

  return app
}
