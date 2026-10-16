import type { FastifyRequest } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { isValidTimeZone } from './timezone.js'

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

/**
 * Reads the user's configured timezone and validates it before it reaches
 * `Intl` — an unusable stored value (bad seed, manual edit) must degrade to UTC
 * with a warning, not crash every request that computes day boundaries.
 *
 * This is the single resolver for "which timezone does this request use"; it
 * deliberately does *not* validate request-supplied overrides, which the
 * calendar module rejects with 422 because a client typo should be visible.
 */
export async function resolveUserTimeZone(prisma: PrismaClient, userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  })

  const stored = user?.timezone
  if (stored && isValidTimeZone(stored)) {
    return stored
  }

  if (stored) {
    // A stored but unusable zone: fall back, but say so instead of silently
    // reporting days in the wrong calendar.
    console.warn(
      `[lingopath] user ${userId.slice(0, 8)} has unusable timezone ${JSON.stringify(stored)}; falling back to ${DEFAULT_TIMEZONE}`,
    )
  }

  return DEFAULT_TIMEZONE
}
