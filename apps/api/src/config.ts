import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DATABASE_URL: z.string().url({ message: 'DATABASE_URL must be a valid URL' }),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // ─── AI recommendations (Phase 10) ────────────────────────────────────────
  //
  // `none` is the default and a supported deployment, not a degraded one: the
  // recommendation engine then uses its deterministic rules and reports that in
  // the response metadata. A missing key never stops the API from starting, and a
  // provider outage never stops it from answering.
  LLM_PROVIDER: z.enum(['none', 'openai-compatible']).default('none'),
  LLM_API_KEY: z.string().optional(),
  LLM_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
  LLM_MODEL: z.string().default('gpt-4o-mini'),
  LLM_TIMEOUT_MS: z.coerce.number().int().min(250).max(120000).default(20000),
  /** Hard cap on recommendations per generation; the engine never exceeds it. */
  RECOMMENDATION_MAX_ITEMS: z.coerce.number().int().min(1).max(10).default(4),
})

function parseEnv() {
  const result = envSchema.safeParse(process.env)
  if (!result.success) {
    console.error('Invalid environment configuration:')
    console.error(result.error.format())
    process.exit(1)
  }
  return result.data
}

export const config = parseEnv()
export type Config = typeof config
