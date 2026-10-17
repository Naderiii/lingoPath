/**
 * Display helpers for the CEFR levels view.
 *
 * These functions only lay out what the API returned: the level order, the change
 * direction and every date already come from the server, so the screen cannot
 * disagree with the data. Nothing here estimates a level, and nothing converts study
 * time into one.
 */

import type { AssessmentMethod, CefrLevel, LevelDimensionSnapshot } from '@lingopath/types'
import { formatDayLabel, formatDayShortLabel, dayKeyFromInstant } from '@/lib/calendar'
export const DIMENSION_LABELS: Record<string, string> = {
  overall: 'Overall',
  listening: 'Listening',
  reading: 'Reading',
  writing: 'Writing',
  speaking: 'Speaking',
}

export const METHOD_LABELS: Record<AssessmentMethod, string> = {
  SELF_REPORTED: 'Self-reported',
  MOCK_TEST: 'Mock test',
  FORMAL_EXAM: 'Formal exam',
}

/**
 * CEFR levels in ascending order, derived from the rank map the API already sends.
 *
 * The web deliberately keeps no copy of the scale's order: one source (the API)
 * means the axis, the pickers and the server can never disagree about it.
 */
export function levelsByRank(rankByLevel: Record<CefrLevel, number>): CefrLevel[] {
  return Object.entries(rankByLevel)
    .sort((a, b) => a[1] - b[1])
    .map(([level]) => level as CefrLevel)
}

export function dimensionLabel(dimension: string): string {
  return DIMENSION_LABELS[dimension] ?? dimension
}

/** `Mon, Sep 1, 2026` for a stored instant. */
export function formatRecordedDate(instant: string): string {
  return formatDayLabel(dayKeyFromInstant(instant))
}

/** `Sep 1` for a stored instant. */
export function formatRecordedShortDate(instant: string): string {
  return formatDayShortLabel(dayKeyFromInstant(instant))
}

export function cefrTone(level: CefrLevel): string {
  switch (level) {
    case 'A1':
      return 'bg-muted text-muted-foreground'
    case 'A2':
      return 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300'
    case 'B1':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
    case 'B2':
      return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300'
    case 'C1':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
    case 'C2':
      return 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300'
  }
}

/**
 * The earlier recording for a dimension, phrased as a fact.
 *
 * `null` when this is the first recording — the card then simply omits the line
 * rather than inventing a baseline to compare against.
 */
export function previousRecordingLabel(snapshot: LevelDimensionSnapshot): string | null {
  if (snapshot.previousLevel === null || snapshot.previousAssessedAt === null) return null

  return `Earlier recording: ${snapshot.previousLevel} · ${formatRecordedShortDate(snapshot.previousAssessedAt)}`
}
