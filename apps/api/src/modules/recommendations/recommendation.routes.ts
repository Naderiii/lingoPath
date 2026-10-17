import type { FastifyPluginAsync } from 'fastify'
import {
  ApplyRecommendationSchema,
  GenerateRecommendationsSchema,
  ListRecommendationHistoryQuerySchema,
  ListRecommendationsQuerySchema,
  RecommendationFeedbackSchema,
} from '@lingopath/types'
import { resolveUserId } from '../../shared/current-user.js'
import { createRecommendationAggregation } from './recommendation.aggregation.js'
import { createRecommendationRepository } from './recommendation.repository.js'
import { createRecommendationService } from './recommendation.service.js'
import { createUnavailableLlmAdapter, type LlmAdapter } from './recommendation.llm.js'

/**
 * Recommendation controller (Phase 10).
 *
 * Thin by design: parse, delegate, serialise. There is no reasoning in this file,
 * and — importantly — no route that changes planning data implicitly. A client can
 * only move something by calling `apply` with an explicit confirmation.
 *
 * The adapter is injected rather than constructed here, so the provider decision
 * stays in the composition root (`app.ts`) and tests can supply a stub without
 * touching configuration or the network.
 */
export interface RecommendationRoutesOptions {
  llmAdapter?: LlmAdapter
  maxCandidates?: number
}

const recommendationRoutes: FastifyPluginAsync<RecommendationRoutesOptions> = async (
  fastify,
  options,
) => {
  const repository = createRecommendationRepository(fastify.prisma)
  const aggregation = createRecommendationAggregation(repository)
  const service = createRecommendationService({
    repository,
    aggregation,
    llm: options.llmAdapter ?? createUnavailableLlmAdapter(),
    ...(options.maxCandidates !== undefined ? { maxCandidates: options.maxCandidates } : {}),
  })

  // POST /api/v1/recommendations/generate
  fastify.post('/recommendations/generate', async (request, reply) => {
    GenerateRecommendationsSchema.parse(request.body ?? {})
    const userId = resolveUserId(request)
    const result = await service.generate(userId)
    return reply.status(201).send(result)
  })

  // GET /api/v1/recommendations?status=NEW&type=SKILL&limit=20
  fastify.get('/recommendations', async (request, reply) => {
    const query = ListRecommendationsQuerySchema.parse(request.query)
    const result = await service.list(resolveUserId(request), query)
    return reply.send(result)
  })

  // GET /api/v1/recommendations/history?action=REJECTED&limit=20
  // The decision trail. Registered before `/recommendations/:id` for clarity;
  // the router already gives the static segment priority.
  fastify.get('/recommendations/history', async (request, reply) => {
    const query = ListRecommendationHistoryQuerySchema.parse(request.query)
    const result = await service.history(resolveUserId(request), query)
    return reply.send(result)
  })

  // GET /api/v1/recommendations/:id
  fastify.get<{ Params: { id: string } }>('/recommendations/:id', async (request, reply) => {
    const recommendation = await service.getById(resolveUserId(request), request.params.id)
    return reply.send({ data: recommendation })
  })

  // POST /api/v1/recommendations/:id/feedback
  // Records the decision only. When the answer is "accepted", the response asks
  // whether to add it to the plan and returns the exact action that would run.
  fastify.post<{ Params: { id: string } }>(
    '/recommendations/:id/feedback',
    async (request, reply) => {
      const body = RecommendationFeedbackSchema.parse(request.body)
      const result = await service.submitFeedback(resolveUserId(request), request.params.id, body)
      return reply.status(201).send(result)
    },
  )

  // POST /api/v1/recommendations/:id/apply
  // The only write to planning data in this module, and only with `confirm: true`.
  fastify.post<{ Params: { id: string } }>('/recommendations/:id/apply', async (request, reply) => {
    const body = ApplyRecommendationSchema.parse(request.body)
    const result = await service.apply(resolveUserId(request), request.params.id, body)
    return reply.status(201).send(result)
  })
}

export default recommendationRoutes
