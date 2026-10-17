/**
 * Exam scoring scales (Phase 9).
 *
 * A score means nothing without the scale it was reported on: 7.5 is a strong
 * IELTS band, a poor TOEFL total and an ordinary self-rating. Rather than
 * hardcoding a maximum (the previous `≤ 100` rule rejected a perfectly valid
 * TOEFL total of 110), every exam carries an opaque scale descriptor that this
 * module resolves, and each score is validated against *its own exam's* scale.
 *
 * Why the descriptor lives in a JSON column: a scoring change — a new TOEFL
 * format, a revised band scale, a provider-specific mock scale — is a new entry in
 * `SCORE_SCALE_PRESETS` or a stored descriptor. No column is added, no migration
 * is needed, and no historical result is reinterpreted.
 *
 * Two rules this module keeps deliberately narrow:
 *
 * - `step` describes the granularity a scale is *reported* at (IELTS half bands),
 *   and drives the decimals the UI shows. It is not enforced as a hard constraint,
 *   because mock providers legitimately report finer precision than the official
 *   scale.
 * - `max: null` means "no upper bound is known", which is different from a missing
 *   `max`. A stored scale with an unknown key must state one of the two, so a
 *   mistyped preset key cannot silently produce an unbounded scale.
 */

import type {
  ExamScaleSource,
  ExamScoreScale,
  ExamScoreScaleInput,
  ExamType,
} from '@lingopath/types'
import { ValidationError } from '../../shared/errors.js'

const SECTION_LABELS: Record<string, string> = {
  listening: 'Listening',
  reading: 'Reading',
  writing: 'Writing',
  speaking: 'Speaking',
}

function fourSections(max: number | null): ExamScoreScale['sections'] {
  return Object.entries(SECTION_LABELS).map(([key, label]) => ({ key, label, max }))
}

/**
 * Decimals a scale is rendered with, derived from its step so the UI never
 * invents precision: a half-band scale shows `7.5`, a whole-point scale `110`.
 */
function decimalsFor(step: number | null): number {
  if (step === null || step <= 0) return 0
  const fraction = String(step).split('.')[1]
  return fraction ? Math.min(4, fraction.length) : 0
}

/** Built-in scales. Adding one here is the whole cost of supporting a new scoring scheme. */
export const SCORE_SCALE_PRESETS: readonly ExamScoreScale[] = [
  {
    key: 'IELTS_BAND',
    label: 'IELTS band',
    kind: 'BAND',
    min: 0,
    max: 9,
    step: 0.5,
    decimals: decimalsFor(0.5),
    targetLabel: 'Target band',
    sections: fourSections(9),
  },
  {
    key: 'TOEFL_TOTAL',
    label: 'TOEFL iBT total score',
    kind: 'TOTAL',
    min: 0,
    max: 120,
    step: 1,
    decimals: decimalsFor(1),
    targetLabel: 'Target score',
    sections: fourSections(30),
  },
]

/** Scale assumed for an exam type that carries none. `null` = unbounded, unknown. */
export const SCORE_SCALE_DEFAULTS: Record<ExamType, string | null> = {
  IELTS: 'IELTS_BAND',
  TOEFL: 'TOEFL_TOTAL',
  OTHER: null,
}

export function getPreset(key: string): ExamScoreScale | null {
  return SCORE_SCALE_PRESETS.find((preset) => preset.key === key) ?? null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toSectionList(value: unknown): ExamScoreScale['sections'] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry['key'] !== 'string') return []
    const key = entry['key']
    const label = typeof entry['label'] === 'string' ? entry['label'] : key
    const max = entry['max']
    return [{ key, label, max: typeof max === 'number' ? max : null }]
  })
}

/**
 * Turns a stored descriptor — or an exam's type default — into a complete scale.
 *
 * `source` says where the answer came from, so a default is never presented to the
 * learner as if it were a choice they made.
 */
export function resolveScoreScale(input: {
  type: ExamType
  stored: unknown
}): { scale: ExamScoreScale | null; source: ExamScaleSource } {
  const { type, stored } = input

  if (stored === null || stored === undefined) {
    const defaultKey = SCORE_SCALE_DEFAULTS[type]
    const preset = defaultKey === null ? null : getPreset(defaultKey)
    return { scale: preset, source: preset ? 'TYPE_DEFAULT' : 'NONE' }
  }

  if (!isRecord(stored) || typeof stored['key'] !== 'string') {
    throw new ValidationError('scoreScale must be an object carrying a string `key`.')
  }

  const descriptor = stored as ExamScoreScaleInput
  const preset = getPreset(descriptor.key)

  if (!preset && descriptor.max === undefined) {
    throw new ValidationError(
      `Unknown score scale '${descriptor.key}'. Use a built-in scale key or supply a complete descriptor (a label and an explicit \`max\`, \`null\` for a scale without a known maximum).`,
      { knownScales: SCORE_SCALE_PRESETS.map((entry) => entry.key) },
    )
  }

  const step = descriptor.step === undefined ? (preset?.step ?? null) : descriptor.step
  const max = descriptor.max === undefined ? (preset?.max ?? null) : descriptor.max

  const scale: ExamScoreScale = {
    key: descriptor.key,
    label: descriptor.label ?? preset?.label ?? descriptor.key,
    kind: descriptor.kind ?? preset?.kind ?? 'CUSTOM',
    min: descriptor.min ?? preset?.min ?? 0,
    max,
    step,
    decimals: decimalsFor(step),
    targetLabel: descriptor.targetLabel ?? preset?.targetLabel ?? 'Target score',
    sections: descriptor.sections ? toSectionList(descriptor.sections) : (preset?.sections ?? []),
  }

  assertUsableScale(scale)

  return { scale, source: 'EXAM' }
}

function assertUsableScale(scale: ExamScoreScale): void {
  if (!Number.isFinite(scale.min)) {
    throw new ValidationError(`Score scale '${scale.key}' has a non-finite minimum.`)
  }
  if (scale.max !== null && (!Number.isFinite(scale.max) || scale.max <= scale.min)) {
    throw new ValidationError(
      `Score scale '${scale.key}' needs a maximum above its minimum (got min ${scale.min}, max ${scale.max}).`,
    )
  }
  if (scale.step !== null && (!Number.isFinite(scale.step) || scale.step <= 0)) {
    throw new ValidationError(`Score scale '${scale.key}' needs a positive step.`)
  }
}

export interface ScoreIssue {
  field: string
  message: string
}

function boundLabel(scale: ExamScoreScale): string {
  return scale.max === null ? `at least ${scale.min}` : `between ${scale.min} and ${scale.max}`
}

/**
 * Validates recorded scores against the exam's own scale.
 *
 * Returns issues instead of throwing so the caller decides how to report them (the
 * service raises one 422 carrying every problem, rather than one error per retry).
 */
export function validateExamScores(
  scale: ExamScoreScale | null,
  scores: { overallScore?: number | null; skillScores?: Record<string, number> },
): ScoreIssue[] {
  const issues: ScoreIssue[] = []
  const sections = scale?.sections ?? []
  const knownKeys = new Set(sections.map((section) => section.key))
  const skillScores = scores.skillScores ?? {}
  const sectionEntries = Object.entries(skillScores)

  if (scores.overallScore === undefined || scores.overallScore === null) {
    if (sectionEntries.length === 0) {
      issues.push({
        field: 'overallScore',
        message:
          'Record an overall score or at least one section score — a result with no scores cannot be compared to anything.',
      })
    }
  }

  const min = scale?.min ?? 0

  if (typeof scores.overallScore === 'number') {
    if (!Number.isFinite(scores.overallScore) || scores.overallScore < min) {
      issues.push({
        field: 'overallScore',
        message: `Overall score must be a number ${scale ? boundLabel(scale) : 'of at least 0'}.`,
      })
    } else if (scale !== null && scale.max !== null && scores.overallScore > scale.max) {
      issues.push({
        field: 'overallScore',
        message: `Overall score must be ${boundLabel(scale)} on the ${scale.label} scale.`,
      })
    }
  }

  for (const [key, value] of sectionEntries) {
    const section = sections.find((entry) => entry.key === key)
    const max = section ? section.max : (scale?.max ?? null)

    if (knownKeys.size > 0 && !section) {
      issues.push({
        field: `skillScores.${key}`,
        message: `Unknown section '${key}' for the ${scale?.label ?? 'exam'} scale. Expected one of: ${[...knownKeys].join(', ')}.`,
      })
      continue
    }

    if (!Number.isFinite(value) || value < min || (max !== null && value > max)) {
      issues.push({
        field: `skillScores.${key}`,
        message: `${section?.label ?? key} must be ${max === null ? `at least ${min}` : `between ${min} and ${max}`}.`,
      })
    }
  }

  return issues
}
