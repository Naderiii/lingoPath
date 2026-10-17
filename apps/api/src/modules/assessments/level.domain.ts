/**
 * CEFR level domain (Phase 9).
 *
 * One assessment row can record up to five levels — overall, listening, reading,
 * writing and speaking — and every dimension has its own history. This module
 * answers the only question the `/levels` view asks of that history: *what is the
 * most recently recorded level for each dimension, and what was recorded before
 * it?*
 *
 * Two boundaries here are deliberate and load-bearing:
 *
 * 1. **Recorded, never inferred.** Everything below is a pure function of
 *    assessment rows. `StudySession` is not an input, this module cannot read
 *    study time at all, and no amount of hours studied can move a level. The
 *    overview is therefore empty until the learner records an assessment —
 *    asserted by a test.
 * 2. **No verdicts.** A level is a level. Nothing here decides whether someone is
 *    ready, not ready or weak, and no dimension is ever labelled a weakness. The
 *    only judgement in this file is the direction of a recorded change
 *    (`up` / `down` / `same`), which is arithmetic on two recorded levels.
 */

import type { AssessmentMethod, CefrLevel, LevelDimension } from '@lingopath/types'

/** Ascending CEFR order. Rank 1 = A1, rank 6 = C2 — the only ordering rule. */
export const CEFR_LEVEL_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const

/**
 * Dimension → field name. Stored columns and request bodies deliberately share
 * these names, so one map keeps create, update, merge and read in step and a
 * rename cannot half-apply.
 */
export const DIMENSION_FIELDS = {
  overall: 'cefrLevel',
  listening: 'listeningLevel',
  reading: 'readingLevel',
  writing: 'writingLevel',
  speaking: 'speakingLevel',
} as const

export type DimensionField = (typeof DIMENSION_FIELDS)[LevelDimension]

/** Display order for every consumer, so the UI cannot drift from the API. */
export const LEVEL_DIMENSIONS: readonly LevelDimension[] = [
  'overall',
  'listening',
  'reading',
  'writing',
  'speaking',
]

/** The level columns of one assessment. Structural, so a Prisma row satisfies it. */
export interface AssessmentLevels {
  id: string
  assessedAt: Date
  method: AssessmentMethod
  cefrLevel: CefrLevel | null
  listeningLevel: CefrLevel | null
  readingLevel: CefrLevel | null
  writingLevel: CefrLevel | null
  speakingLevel: CefrLevel | null
}

export interface DimensionSnapshot {
  dimension: LevelDimension
  assessmentId: string
  level: CefrLevel
  rank: number
  assessedAt: string
  method: AssessmentMethod
  previousLevel: CefrLevel | null
  previousRank: number | null
  previousAssessedAt: string | null
  /** `null` when this is the first recording for the dimension. */
  changeDirection: 'up' | 'down' | 'same' | null
  changeSteps: number | null
}

export function cefrRank(level: CefrLevel): number {
  const index = CEFR_LEVEL_ORDER.indexOf(level)
  return index === -1 ? 0 : index + 1
}

export function rankByLevel(): Record<CefrLevel, number> {
  const ranks = {} as Record<CefrLevel, number>
  for (const level of CEFR_LEVEL_ORDER) {
    ranks[level] = cefrRank(level)
  }
  return ranks
}

/** Level recorded for one dimension, or `null` when it was not assessed. */
export function levelFor(record: AssessmentLevels, dimension: LevelDimension): CefrLevel | null {
  return record[DIMENSION_FIELDS[dimension]]
}

/**
 * Per-dimension levels of one assessment, keyed by dimension.
 *
 * This is what API payloads expose, so clients never have to know the column names
 * or repeat the dimension-to-field mapping that lives here.
 */
export function levelsOf(record: AssessmentLevels): Record<LevelDimension, CefrLevel | null> {
  const levels = {} as Record<LevelDimension, CefrLevel | null>
  for (const dimension of LEVEL_DIMENSIONS) {
    levels[dimension] = record[DIMENSION_FIELDS[dimension]]
  }
  return levels
}

/**
 * Dimensions that actually carry a level. Used for the "an assessment must record
 * something" rule, evaluated on create input and on the merged row of an update so
 * both paths share one definition.
 */
export function recordedDimensions(
  levels: Partial<Record<DimensionField, CefrLevel | null | undefined>>,
): LevelDimension[] {
  return LEVEL_DIMENSIONS.filter((dimension) => {
    const value = levels[DIMENSION_FIELDS[dimension]]
    return value !== null && value !== undefined
  })
}

/**
 * Applies a partial level patch on top of a stored row. `undefined` leaves a
 * dimension untouched, `null` clears it — the distinction the update contract
 * promises and the one a naive spread loses.
 */
export function mergeLevels(
  current: AssessmentLevels,
  patch: Partial<Record<DimensionField, CefrLevel | null | undefined>>,
): Record<DimensionField, CefrLevel | null> {
  const merged = {} as Record<DimensionField, CefrLevel | null>
  for (const dimension of LEVEL_DIMENSIONS) {
    const field = DIMENSION_FIELDS[dimension]
    const value = patch[field]
    merged[field] = value === undefined ? current[field] : value
  }
  return merged
}

/**
 * Newest first, ties broken by id: two assessments taken on the same day must
 * always resolve to the same "latest" value instead of depending on row order.
 * The input array is copied, never mutated.
 */
export function sortAssessmentsDesc<T extends { id: string; assessedAt: Date }>(records: T[]): T[] {
  return [...records].sort(
    (a, b) => b.assessedAt.getTime() - a.assessedAt.getTime() || a.id.localeCompare(b.id),
  )
}

function directionOf(previousRank: number, rank: number): 'up' | 'down' | 'same' {
  if (rank > previousRank) return 'up'
  if (rank < previousRank) return 'down'
  return 'same'
}

/**
 * Most recently recorded level per dimension, plus the recording before it.
 *
 * Only rows that actually recorded a dimension can advance it: an assessment that
 * skipped listening neither clears the listening level nor becomes the latest
 * listening result. A dimension with no recording at all stays `null`, which the
 * UI shows as "not recorded" — never as a level it guessed.
 */
export function buildCurrentSnapshots(
  records: AssessmentLevels[],
): Record<LevelDimension, DimensionSnapshot | null> {
  const ordered = sortAssessmentsDesc(records)
  const snapshots = {} as Record<LevelDimension, DimensionSnapshot | null>

  for (const dimension of LEVEL_DIMENSIONS) {
    const recordings = ordered.filter((record) => levelFor(record, dimension) !== null)
    const latest = recordings[0]
    const latestLevel = latest ? levelFor(latest, dimension) : null

    if (!latest || latestLevel === null) {
      snapshots[dimension] = null
      continue
    }

    const previous = recordings[1]
    const previousLevel = previous ? levelFor(previous, dimension) : null
    const rank = cefrRank(latestLevel)
    const previousRank = previousLevel === null ? null : cefrRank(previousLevel)

    snapshots[dimension] = {
      dimension,
      assessmentId: latest.id,
      level: latestLevel,
      rank,
      assessedAt: latest.assessedAt.toISOString(),
      method: latest.method,
      previousLevel,
      previousRank,
      previousAssessedAt: previous ? previous.assessedAt.toISOString() : null,
      changeDirection: previousRank === null ? null : directionOf(previousRank, rank),
      changeSteps: previousRank === null ? null : rank - previousRank,
    }
  }

  return snapshots
}
