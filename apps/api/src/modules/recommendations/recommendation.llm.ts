/**
 * LLM adapter boundary (Phase 10).
 *
 * The application does not know which provider is behind this interface, and it
 * never will: nothing outside this file mentions a vendor's request shape, header
 * or response envelope. Swapping providers means adding one factory, not touching
 * the engine, the service or the routes.
 *
 * Two properties are contractual, not incidental:
 *
 * 1. **`complete` never throws.** Every failure — a missing provider key, a
 *    timeout, a 500, a body that is not the expected shape — is converted into an
 *    `LlmFailure`. Callers therefore cannot forget a `try`/`catch` and crash an
 *    endpoint because a third party was slow.
 * 2. **Failures are typed.** The caller needs to tell "no provider is configured"
 *    (a normal deployment state) apart from "the provider timed out" (worth
 *    logging), and the API reports that distinction instead of a generic error.
 *
 * The provider credential lives only inside this module's closure. It is never
 * part of a prompt, never logged and never returned to a client.
 */

export type LlmFailureReason =
  | 'NOT_CONFIGURED'
  | 'TIMEOUT'
  | 'HTTP_ERROR'
  | 'EMPTY_RESPONSE'
  | 'TRANSPORT_ERROR'
  | 'BAD_REQUEST_SHAPE'

export interface LlmRequest {
  system: string
  user: string
  /** Requested output size cap; the adapter clamps it. */
  maxOutputTokens?: number
}

export interface LlmSuccess {
  ok: true
  text: string
  provider: string
  model: string
}

export interface LlmFailure {
  ok: false
  reason: LlmFailureReason
  /** Short, non-sensitive explanation suitable for logs and API metadata. */
  detail: string
}

export type LlmResult = LlmSuccess | LlmFailure

export interface LlmAdapter {
  readonly provider: string
  readonly model: string | null
  readonly configured: boolean
  complete(request: LlmRequest): Promise<LlmResult>
}

/** Used when no provider is configured, which is the default deployment. */
export function createUnavailableLlmAdapter(
  reason: LlmFailureReason = 'NOT_CONFIGURED',
  detail = 'No language model provider is configured.',
): LlmAdapter {
  return {
    provider: 'none',
    model: null,
    configured: false,
    async complete() {
      return { ok: false, reason, detail }
    },
  }
}

export interface OpenAiCompatibleConfig {
  /** Provider credential, read from configuration and held in this closure only. */
  providerAuth: string
  /** Base URL without the trailing `/chat/completions`. */
  baseUrl: string
  model: string
  timeoutMs: number
  /**
   * Sent as `max_tokens`. Kept modest on purpose: recommendation output is a
   * short JSON document, not an essay.
   */
  maxOutputTokens: number
}

const MAX_ALLOWED_TIMEOUT_MS = 120_000
const MIN_ALLOWED_TIMEOUT_MS = 250

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * A minimal OpenAI-compatible chat-completions client.
 *
 * Written against `fetch` rather than a vendor SDK so the API server gains no
 * provider dependency and a self-hosted or proxied endpoint works unchanged. The
 * request shape is the common denominator most providers implement.
 */
export function createOpenAiCompatibleLlmAdapter(config: OpenAiCompatibleConfig): LlmAdapter {
  const timeoutMs = Math.min(
    MAX_ALLOWED_TIMEOUT_MS,
    Math.max(MIN_ALLOWED_TIMEOUT_MS, config.timeoutMs),
  )
  const configured = config.providerAuth.trim().length > 0

  return {
    provider: 'openai-compatible',
    model: config.model,
    configured,

    async complete(request: LlmRequest): Promise<LlmResult> {
      if (!configured) {
        return {
          ok: false,
          reason: 'NOT_CONFIGURED',
          detail: 'No provider credential is configured for the language model provider.',
        }
      }

      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)

      try {
        const response = await fetch(`${trimTrailingSlash(config.baseUrl)}/chat/completions`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${config.providerAuth}`,
          },
          body: JSON.stringify({
            model: config.model,
            temperature: 0.2,
            max_tokens: Math.min(
              config.maxOutputTokens,
              request.maxOutputTokens ?? config.maxOutputTokens,
            ),
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: request.system },
              { role: 'user', content: request.user },
            ],
          }),
          signal: controller.signal,
        })

        if (!response.ok) {
          return {
            ok: false,
            reason: 'HTTP_ERROR',
            detail: `Provider responded with HTTP ${response.status}.`,
          }
        }

        const body: unknown = await response.json()
        const text = extractMessageText(body)

        if (text === null) {
          return {
            ok: false,
            reason: 'EMPTY_RESPONSE',
            detail: 'Provider response did not contain any message text.',
          }
        }

        return { ok: true, text, provider: 'openai-compatible', model: config.model }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return {
            ok: false,
            reason: 'TIMEOUT',
            detail: `Provider did not answer within ${timeoutMs} ms.`,
          }
        }
        return {
          ok: false,
          reason: 'TRANSPORT_ERROR',
          detail:
            error instanceof Error
              ? `Provider call failed: ${error.name}`
              : 'Provider call failed.',
        }
      } finally {
        clearTimeout(timer)
      }
    },
  }
}

/** Pulls `choices[0].message.content` out of a chat-completions body, defensively. */
export function extractMessageText(body: unknown): string | null {
  if (!isRecord(body)) return null
  const choices = body['choices']
  if (!Array.isArray(choices) || choices.length === 0) return null

  const first = choices[0]
  if (!isRecord(first)) return null

  const message = first['message']
  if (!isRecord(message)) return null

  const content = message['content']

  if (typeof content === 'string') {
    return content.trim().length > 0 ? content : null
  }

  // Some providers return content as an array of parts.
  if (Array.isArray(content)) {
    const joined = content
      .map((part) => (isRecord(part) && typeof part['text'] === 'string' ? part['text'] : ''))
      .join('')
      .trim()
    return joined.length > 0 ? joined : null
  }

  return null
}

export interface LlmAdapterConfigInput {
  provider: 'none' | 'openai-compatible'
  providerAuth: string | undefined
  baseUrl: string
  model: string
  timeoutMs: number
  maxOutputTokens?: number
}

/**
 * The subset of environment configuration this module reads.
 *
 * Declared structurally so the composition root can pass the parsed `config`
 * object without this module importing it — the adapter stays testable in
 * isolation, and the API server's startup validation stays in one place.
 */
export interface LlmEnvironmentConfig {
  LLM_PROVIDER: 'none' | 'openai-compatible'
  LLM_API_KEY?: string | undefined
  LLM_BASE_URL: string
  LLM_MODEL: string
  LLM_TIMEOUT_MS: number
}

/**
 * Builds the adapter the whole app uses.
 *
 * `'none'` is a first-class choice, not a degraded state: with no provider the
 * engine still produces grounded recommendations from its deterministic rules, and
 * the API says so in its metadata.
 */
export function createLlmAdapter(config: LlmAdapterConfigInput): LlmAdapter {
  if (config.provider === 'none') {
    return createUnavailableLlmAdapter(
      'NOT_CONFIGURED',
      'Recommendation text is generated by the built-in rule engine; no language model provider is configured.',
    )
  }

  if (!config.providerAuth || config.providerAuth.trim().length === 0) {
    return createUnavailableLlmAdapter(
      'NOT_CONFIGURED',
      'A provider is selected but no credential is configured, so the built-in rule engine is used.',
    )
  }

  return createOpenAiCompatibleLlmAdapter({
    providerAuth: config.providerAuth,
    baseUrl: config.baseUrl,
    model: config.model,
    timeoutMs: config.timeoutMs,
    maxOutputTokens: config.maxOutputTokens ?? 1200,
  })
}

/**
 * Builds the adapter from validated environment configuration.
 *
 * The credential is read here and never leaves the adapter closure: it is not
 * logged, not placed in a prompt and not returned to a caller.
 */
export function createLlmAdapterFromEnvironment(env: LlmEnvironmentConfig): LlmAdapter {
  return createLlmAdapter({
    provider: env.LLM_PROVIDER,
    providerAuth: env.LLM_API_KEY,
    baseUrl: env.LLM_BASE_URL,
    model: env.LLM_MODEL,
    timeoutMs: env.LLM_TIMEOUT_MS,
  })
}
