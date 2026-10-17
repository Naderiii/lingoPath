/**
 * The recommendation engine (Phase 10).
 *
 * Orchestrates one generation:
 *
 * ```
 * context → analysis → candidates → feedback rules → prompt → LLM → Zod → guard
 *                                                       ↘ failure → candidates
 * ```
 *
 * Two guarantees come out of this ordering:
 *
 * - **Grounded.** `supportingData` is always the engine's own list of facts. The
 *   model may rewrite the prose around it; it can never author the evidence. A
 *   rewritten recommendation is therefore displaying exactly the numbers the rule
 *   engine computed.
 * - **Degradable.** Every failure path — no provider, timeout, prose instead of
 *   JSON, a schema mismatch, an ability verdict — lands on the same safe output:
 *   the deterministic candidates. There is no branch in which a generation failure
 *   reaches the caller as an exception.
 */

import type { RecommendationSource } from '@lingopath/types'
import {
  analyzeContext,
  minConfidence,
  type RecommendationAnalysis,
  type RecommendationSignal,
} from './recommendation.analysis.js'
import {
  applyFeedbackRules,
  buildCandidates,
  type CandidateRecommendation,
  type SuppressedCandidate,
} from './recommendation.candidates.js'
import type { RecommendationContext } from './recommendation.context.js'
import type { LlmAdapter, LlmFailureReason, LlmResult } from './recommendation.llm.js'
import {
  buildRecommendationPrompt,
  extractJsonDocument,
  findReasoningViolation,
  LlmRecommendationResponseSchema,
  promptIdFor,
} from './recommendation.prompt.js'

export interface GeneratedRecommendation extends Omit<CandidateRecommendation, 'candidateId'> {
  /** The internal, stable id (the candidate's), never the `c1` prompt handle. */
  candidateId: string
  source: RecommendationSource
  /** Literal description of what the confidence band rests on. */
  confidenceBasis: string
}

export interface RecommendationLlmOutcome {
  attempted: boolean
  available: boolean
  outputAccepted: boolean
  reason: string | null
  provider: string
  model: string | null
}

export interface RecommendationEngineResult {
  recommendations: GeneratedRecommendation[]
  analysis: RecommendationAnalysis
  suppressed: SuppressedCandidate[]
  llm: RecommendationLlmOutcome
  considered: number
  rejectedByValidation: number
}

export interface RecommendationEngineDeps {
  llm: LlmAdapter
  maxCandidates?: number
}

const FAILURE_REASON_TEXT: Record<LlmFailureReason, string> = {
  NOT_CONFIGURED: 'No language model provider is configured.',
  TIMEOUT: 'The language model provider timed out.',
  HTTP_ERROR: 'The language model provider returned an error response.',
  EMPTY_RESPONSE: 'The language model provider returned no usable text.',
  TRANSPORT_ERROR: 'The language model provider could not be reached.',
  BAD_REQUEST_SHAPE: 'The language model provider rejected the request shape.',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Reads `c1`…`cN` back to a zero-based candidate index, or `null`. */
function candidateIndexFromPromptId(value: string, count: number): number | null {
  const match = /^c(\d+)$/.exec(value)
  if (match === null || match[1] === undefined) return null
  const index = Number(match[1]) - 1
  return index >= 0 && index < count ? index : null
}

function confidenceBasisFor(
  level: GeneratedRecommendation['confidence'],
  context: RecommendationContext,
): string {
  return `${level}: derived from ${context.activity.lifetime.sessions} recorded session${
    context.activity.lifetime.sessions === 1 ? '' : 's'
  } across ${context.activity.lifetime.activeDays} active day${
    context.activity.lifetime.activeDays === 1 ? '' : 's'
  }. A coarse band, not a probability.`
}

function deterministicOutput(
  candidates: readonly CandidateRecommendation[],
  context: RecommendationContext,
): GeneratedRecommendation[] {
  return candidates.map((candidate) => ({
    ...candidate,
    source: 'RULE_BASED',
    confidenceBasis: confidenceBasisFor(candidate.confidence, context),
  }))
}

interface MergeOutcome {
  accepted: GeneratedRecommendation[]
  rejected: number
  structuralFailure: string | null
}

/**
 * Validates the model's document against the candidates it was given.
 *
 * Structural problems reject the whole document (the model did not follow the
 * contract). Prose that breaks a reasoning rule rejects only its own item, so one
 * bad sentence does not throw away four good ones.
 */
function mergeLlmOutput(input: {
  parsed: unknown
  candidates: readonly CandidateRecommendation[]
  signals: readonly RecommendationSignal[]
  context: RecommendationContext
}): MergeOutcome {
  const { parsed, candidates, signals, context } = input

  const document = LlmRecommendationResponseSchema.safeParse(parsed)
  if (!document.success) {
    return {
      accepted: [],
      rejected: 0,
      structuralFailure: 'The model output did not match the required JSON schema.',
    }
  }

  const signalById = new Map(signals.map((signal) => [signal.id, signal]))
  const mustInclude = new Set(
    candidates
      .map((candidate, index) => {
        const firstSignalId = candidate.signalIds[0]
        const signal = firstSignalId === undefined ? undefined : signalById.get(firstSignalId)
        return signal?.severity === 'ATTENTION' ? promptIdFor(index) : null
      })
      .filter((value): value is string => value !== null),
  )

  const seen = new Set<number>()
  const accepted: GeneratedRecommendation[] = []
  let rejected = 0

  for (const item of document.data.recommendations) {
    const index = candidateIndexFromPromptId(item.candidateId, candidates.length)
    if (index === null) {
      return {
        accepted: [],
        rejected: 0,
        structuralFailure: `The model referenced an unknown candidate '${item.candidateId}'.`,
      }
    }
    if (seen.has(index)) {
      return {
        accepted: [],
        rejected: 0,
        structuralFailure: `The model returned candidate '${item.candidateId}' more than once.`,
      }
    }
    seen.add(index)

    const candidate = candidates[index]
    if (!candidate) {
      return {
        accepted: [],
        rejected: 0,
        structuralFailure: `The model referenced an unknown candidate '${item.candidateId}'.`,
      }
    }

    // A rewrite may not exceed the confidence the evidence allows, whatever the
    // model thinks. Clamping keeps the guarantee without discarding the prose.
    const confidence = minConfidence(candidate.confidence, item.confidence)

    const prose = `${item.title}\n${item.recommendation}\n${item.rationale}`
    const violation = findReasoningViolation(prose)
    if (violation !== null) {
      rejected++
      continue
    }

    accepted.push({
      ...candidate,
      title: item.title,
      recommendation: item.recommendation,
      rationale: item.rationale,
      confidence,
      estimatedDurationMinutes: item.estimatedDurationMinutes ?? candidate.estimatedDurationMinutes,
      source: 'LLM',
      confidenceBasis: confidenceBasisFor(confidence, context),
    })
  }

  const missing = [...mustInclude].filter(
    (promptId) => !document.data.recommendations.some((item) => item.candidateId === promptId),
  )
  if (missing.length > 0) {
    return {
      accepted: [],
      rejected: 0,
      structuralFailure: `The model dropped ${missing.length} candidate(s) marked mustInclude.`,
    }
  }

  return { accepted, rejected, structuralFailure: null }
}

/**
 * Runs one generation.
 *
 * Never throws for a model-related reason: the failure is reported in `llm` and
 * the deterministic candidates are returned in place of the model's wording.
 */
export async function generateRecommendations(
  context: RecommendationContext,
  deps: RecommendationEngineDeps,
): Promise<RecommendationEngineResult> {
  const analysis = analyzeContext(context)
  const candidates = buildCandidates(context, analysis.signals, analysis, {
    ...(deps.maxCandidates !== undefined ? { maxCandidates: deps.maxCandidates } : {}),
  })
  const { candidates: usable, suppressed } = applyFeedbackRules(candidates, context)

  const llmBase: RecommendationLlmOutcome = {
    attempted: false,
    available: deps.llm.configured,
    outputAccepted: false,
    reason: deps.llm.configured ? null : 'No language model provider is configured.',
    provider: deps.llm.provider,
    model: deps.llm.model,
  }

  if (usable.length === 0) {
    return {
      recommendations: [],
      analysis,
      suppressed,
      llm: llmBase,
      considered: candidates.length,
      rejectedByValidation: 0,
    }
  }

  // No provider means no request: "attempted" describes what actually happened,
  // and the deterministic path is the product here, not a failure mode.
  if (!deps.llm.configured) {
    return {
      recommendations: deterministicOutput(usable, context),
      analysis,
      suppressed,
      llm: {
        ...llmBase,
        attempted: false,
        available: false,
        outputAccepted: false,
        reason:
          'No language model provider is configured, so the built-in rule engine wrote these recommendations.',
      },
      considered: candidates.length,
      rejectedByValidation: 0,
    }
  }

  const prompt = buildRecommendationPrompt({
    context,
    analysis,
    candidates: usable,
    signals: analysis.signals,
  })

  let result: LlmResult
  try {
    result = await deps.llm.complete(prompt)
  } catch (error) {
    // A custom adapter is outside our control; a throw must not become a 500.
    result = {
      ok: false,
      reason: 'TRANSPORT_ERROR',
      detail: error instanceof Error ? `Adapter threw ${error.name}` : 'Adapter threw.',
    }
  }

  if (!result.ok) {
    return {
      recommendations: deterministicOutput(usable, context),
      analysis,
      suppressed,
      llm: {
        ...llmBase,
        attempted: true,
        available: false,
        outputAccepted: false,
        reason: `${FAILURE_REASON_TEXT[result.reason]} ${result.detail}`.trim(),
      },
      considered: candidates.length,
      rejectedByValidation: 0,
    }
  }

  const availableLlm: RecommendationLlmOutcome = {
    ...llmBase,
    attempted: true,
    available: true,
  }

  let parsed: unknown
  const document = extractJsonDocument(result.text)
  if (document === null) {
    return {
      recommendations: deterministicOutput(usable, context),
      analysis,
      suppressed,
      llm: {
        ...availableLlm,
        reason: 'The model response contained no JSON document, so it was discarded.',
      },
      considered: candidates.length,
      rejectedByValidation: 0,
    }
  }

  try {
    parsed = JSON.parse(document)
  } catch {
    return {
      recommendations: deterministicOutput(usable, context),
      analysis,
      suppressed,
      llm: {
        ...availableLlm,
        reason: 'The model response was not valid JSON, so it was discarded.',
      },
      considered: candidates.length,
      rejectedByValidation: 0,
    }
  }

  if (!isRecord(parsed)) {
    return {
      recommendations: deterministicOutput(usable, context),
      analysis,
      suppressed,
      llm: { ...availableLlm, reason: 'The model response was not a JSON object.' },
      considered: candidates.length,
      rejectedByValidation: 0,
    }
  }

  const merged = mergeLlmOutput({
    parsed,
    candidates: usable,
    signals: analysis.signals,
    context,
  })

  if (merged.structuralFailure !== null || merged.accepted.length === 0) {
    return {
      recommendations: deterministicOutput(usable, context),
      analysis,
      suppressed,
      llm: {
        ...availableLlm,
        reason:
          merged.structuralFailure ??
          'Every recommendation the model wrote was rejected by the reasoning guard.',
      },
      considered: candidates.length,
      rejectedByValidation: merged.rejected,
    }
  }

  return {
    recommendations: merged.accepted,
    analysis,
    suppressed,
    llm: { ...availableLlm, outputAccepted: true },
    considered: candidates.length,
    rejectedByValidation: merged.rejected,
  }
}
