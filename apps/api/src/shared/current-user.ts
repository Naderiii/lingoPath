import type { FastifyRequest } from 'fastify'

/**
 * Phase 1–7 use a single seeded user and no authentication. Every module resolves
 * its identity here instead of re-declaring the constant, so there is exactly one
 * place to change when real authentication arrives.
 */
export const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001'

/** Fallback when the user row is missing or carries an unusable timezone. */
export const DEFAULT_TIMEZONE = 'UTC'

/**
 * Resolves the acting user for a request. An `x-user-id` header wins so the
 * dashboard and tests can exercise other users without a schema change.
 */
export function resolveUserId(request: FastifyRequest): string {
  const header = request.headers['x-user-id']
  const value = Array.isArray(header) ? header[0] : header
  const trimmed = typeof value === 'string' ? value.trim() : ''
  return trimmed.length > 0 ? trimmed : DEFAULT_USER_ID
}
