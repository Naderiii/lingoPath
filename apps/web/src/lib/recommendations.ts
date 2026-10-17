/**
 * Presentation rules for recommendations (Phase 11).
 *
 * The engine (Phase 10) decides *what* is worth saying and how much evidence is
 * behind it. This module decides only how that reads on screen — and, where it
 * can, it refuses to restate a rule the server already owns: confidence bands
 * arrive with their own explanation, dates arrive as instants, durations arrive
 * in minutes.
 *
 * Two rules are encoded here rather than in a component:
 *
 * 1. **A suggestion is not a plan change.** `toApplyInput` is the single place
 *    that turns an edited draft into the confirmed payload, and it always sends
 *    `confirm: true` — the API refuses anything else. The dashboard never calls
 *    it; only the confirmation dialog does.
 * 2. **Date-only fields keep the day the learner picked.** `localDayStartIso`
 *    maps a `YYYY-MM-DD` input to local midnight, not UTC midnight, so a learner
 *    west of UTC does not have "today" silently become yesterday.
 */

import type {
  ApplyRecommendation,
  Recommendation,
  RecommendationAction,
  RecommendationConfidence,
  RecommendationEvidenceSource,
  RecommendationHistoryEntry,
  RecommendationStatus,
  RecommendationType,
} from '@lingopath/types'
import { formatDayLabel, formatMinutes, todayInputValue } from '@/lib/calendar'

export { todayInputValue }

/** How many suggestions the primary view may show. */
export const PRIMARY_RECOMMENDATION_LIMIT = 3

export const DEFAULT_PLAN_DURATION_MINUTES = 30
export const MIN_PLAN_DURATION_MINUTES = 5
export const MAX_PLAN_DURATION_MINUTES = 480

const CONFIDENCE_RANK: Record<RecommendationConfidence, number> = {
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
}

export const TYPE_LABELS: Record<RecommendationType, string> = {
  SKILL: 'Skill focus',
  DURATION: 'Session length',
  BALANCE: 'Skill balance',
  EXAM_PREPARATION: 'Exam preparation',
  CONSISTENCY: 'Consistency',
  PLAN_ADJUSTMENT: 'Plan pacing',
}

export const CONFIDENCE_LABELS: Record<RecommendationConfidence, string> = {
  LOW: 'Low',
  MEDIUM: 'Moderate',
  HIGH: 'High',
}

export const ACTION_LABELS: Record<RecommendationAction, string> = {
  ACCEPTED: 'Accepted',
  REJECTED: 'Rejected',
  MODIFIED: 'Adjusted',
  POSTPONED: 'Moved later',
  IGNORED: 'Not seen',
}

export const EVIDENCE_SOURCE_LABELS: Record<RecommendationEvidenceSource, string> = {
  STUDY_SESSIONS: 'Study sessions',
  RECORDED_ASSESSMENT: 'Recorded level',
  RECORDED_EXAM_RESULT: 'Exam result',
  GOALS: 'Goals',
  PLANS: 'Plans',
  OBJECTIVE: 'Objective',
  CALENDAR: 'Calendar',
}

export function recommendationTypeLabel(type: RecommendationType): string {
  return TYPE_LABELS[type]
}

export function confidenceLabel(confidence: RecommendationConfidence): string {
  return CONFIDENCE_LABELS[confidence]
}

/**
 * The stored confidence sentence without its leading band name.
 *
 * The payload's `confidenceBasis` starts with `LOW:`, `MEDIUM:` or `HIGH:` so a
 * raw consumer sees the band even in a log. On screen the band is already the chip
 * next to it, so the prefix is dropped instead of printed twice.
 */
export function confidenceExplanation(basis: string): string {
  return basis.replace(/^(LOW|MEDIUM|HIGH):\s*/i, '')
}

export function actionLabel(action: RecommendationAction): string {
  return ACTION_LABELS[action]
}

export function statusLabel(status: RecommendationStatus, appliedAt: string | null): string {
  switch (status) {
    case 'NEW':
      return 'New'
    case 'ACCEPTED':
      return appliedAt === null ? 'Accepted — not added' : 'Added to plan'
    case 'MODIFIED':
      return appliedAt === null ? 'Adjusted — not added' : 'Added to plan'
    case 'REJECTED':
      return 'Rejected'
    case 'POSTPONED':
      return 'Moved later'
    case 'IGNORED':
      return 'Not seen'
    case 'SUPERSEDED':
      return 'Replaced'
    case 'EXPIRED':
      return 'Expired'
  }
}

export function evidenceSourceLabel(source: RecommendationEvidenceSource): string {
  return EVIDENCE_SOURCE_LABELS[source]
}

/**
 * Whether the learner can still do something with this row.
 *
 * Accepted-but-unapplied counts: the decision was taken, the plan was not
 * touched, and the learner is mid-flow. Everything else is history.
 */
export function isActionable(recommendation: Recommendation): boolean {
  if (recommendation.status === 'NEW') return true
  return (
    (recommendation.status === 'ACCEPTED' || recommendation.status === 'MODIFIED') &&
    recommendation.appliedAt === null
  )
}

/** Strongest evidence first, newest first as the tie-breaker. */
export function compareRecommendations(a: Recommendation, b: Recommendation): number {
  const byConfidence = CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence]
  if (byConfidence !== 0) return byConfidence
  return b.generatedAt.localeCompare(a.generatedAt)
}

/**
 * The one to three rows the dashboard may show.
 *
 * Unfinished decisions come first — the learner already said yes, so the useful
 * next step is finishing it — followed by new suggestions ranked by how much
 * evidence stands behind them. The limit is enforced here, not by CSS.
 */
export function selectPrimaryRecommendations(
  items: readonly Recommendation[],
  limit: number = PRIMARY_RECOMMENDATION_LIMIT,
): Recommendation[] {
  const actionable = items.filter(isActionable)
  const accepted = actionable.filter((item) => item.status !== 'NEW')
  const fresh = actionable.filter((item) => item.status === 'NEW').sort(compareRecommendations)
  return [...accepted, ...fresh].slice(0, Math.max(0, limit))
}

// ─── Plan item draft ─────────────────────────────────────────────────────────

export type PlanDraftField = 'duration' | 'skill' | 'topic' | 'date'

export const PLAN_DRAFT_FIELD_LABELS: Record<PlanDraftField, string> = {
  duration: 'duration',
  skill: 'skill',
  topic: 'topic',
  date: 'date',
}

export interface PlanDraft {
  durationMinutes: number
  skillId: string | null
  topic: string
  /** `YYYY-MM-DD`, the day the learner picked. */
  date: string
}

/**
 * The item a confirmation would create, before the learner touches anything.
 *
 * Duration comes from the recommendation's own estimate, never from the
 * suggested goal's `targetMinutes`: that number is a weekly total, and using it
 * as a single session would silently multiply the learner's plan by seven.
 */
export function draftFor(recommendation: Recommendation, today: string): PlanDraft {
  const duration = recommendation.estimatedDurationMinutes ?? DEFAULT_PLAN_DURATION_MINUTES
  return {
    durationMinutes: sanitizeDuration(duration),
    skillId: recommendation.suggestedAction?.skillId ?? recommendation.relatedSkillId,
    topic: '',
    date: isDateInputValue(today) ? today : todayInputValue(),
  }
}

export function sanitizeDuration(value: number | string): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) return DEFAULT_PLAN_DURATION_MINUTES
  return Math.min(
    MAX_PLAN_DURATION_MINUTES,
    Math.max(MIN_PLAN_DURATION_MINUTES, Math.round(parsed)),
  )
}

/** True for a real calendar day in `YYYY-MM-DD` form (no `2026-02-31`). */
export function isDateInputValue(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number) as [number, number, number]
  const probe = new Date(Date.UTC(year, month - 1, day))
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() + 1 === month &&
    probe.getUTCDate() === day
  )
}

/** Local midnight of the picked day, as the instant the API stores. */
export function localDayStartIso(dayInput: string): string {
  const [year, month, day] = dayInput.split('-').map(Number) as [number, number, number]
  return new Date(year, month - 1, day, 0, 0, 0, 0).toISOString()
}

/** Last millisecond of the picked local day, inclusive in the API's rules. */
export function localDayEndIso(dayInput: string): string {
  const [year, month, day] = dayInput.split('-').map(Number) as [number, number, number]
  return new Date(year, month - 1, day, 23, 59, 59, 999).toISOString()
}

/**
 * The confirmed payload.
 *
 * A confirmed suggestion becomes one daily plan item for the picked day — never a
 * session, never an edit to an existing plan. `confirm: true` is literal on
 * purpose: the API rejects an unconfirmed write, and this function is the only
 * producer of the request body.
 */
export function toApplyInput(draft: PlanDraft): ApplyRecommendation {
  const topic = draft.topic.trim()
  return {
    confirm: true,
    period: 'DAILY',
    targetMinutes: sanitizeDuration(draft.durationMinutes),
    skillId: draft.skillId,
    startDate: localDayStartIso(draft.date),
    endDate: localDayEndIso(draft.date),
    topic: topic.length > 0 ? topic : null,
  }
}

export function draftChangedFields(draft: PlanDraft, base: PlanDraft): PlanDraftField[] {
  const changed: PlanDraftField[] = []
  if (sanitizeDuration(draft.durationMinutes) !== sanitizeDuration(base.durationMinutes)) {
    changed.push('duration')
  }
  if (draft.skillId !== base.skillId) changed.push('skill')
  if (draft.topic.trim() !== base.topic.trim()) changed.push('topic')
  if (draft.date !== base.date) changed.push('date')
  return changed
}

/** `45m · Writing · IELTS Task 2 · Sat, Oct 17, 2026` */
export function describePlanItem(draft: PlanDraft, skillName: string | null): string {
  const parts = [formatMinutes(sanitizeDuration(draft.durationMinutes))]
  if (skillName !== null) parts.push(skillName)
  const topic = draft.topic.trim()
  if (topic.length > 0) parts.push(topic)
  parts.push(formatDayLabel(draft.date))
  return parts.join(' · ')
}

// ─── History ─────────────────────────────────────────────────────────────────

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

/**
 * A decision's local date and time.
 *
 * Unlike a date-only field, a decision is a real instant, so the learner's own
 * clock is the right one to show. Spelled out from parts rather than
 * `toLocaleString` so the format is stable across browsers and tests.
 */
export function formatDecisionDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  const hours = date.getHours()
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const suffix = hours >= 12 ? 'PM' : 'AM'
  const hour12 = hours % 12 === 0 ? 12 : hours % 12
  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}, ${hour12}:${minutes} ${suffix}`
}

export function historyExcerpt(text: string, max = 150): string {
  const trimmed = text.trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max - 1).trimEnd()}…`
}

/**
 * `Added to plan` only on a decision that could have added something.
 *
 * A rejection followed by a later acceptance leaves `appliedAt` set on the
 * recommendation, and stamping that old rejection with "Added to plan" would
 * credit the wrong decision. The marker therefore follows the action too.
 */
export function historyAppliedLabel(entry: RecommendationHistoryEntry): string | null {
  if (entry.appliedAt === null) return null
  if (entry.action !== 'ACCEPTED' && entry.action !== 'MODIFIED') return null
  return 'Added to plan'
}

/**
 * A usable sentence out of a failed request.
 *
 * The API's own message is specific ("The active objective changed…"), so it is
 * shown when it exists. A bare transport error (`HTTP 502`) is replaced with the
 * caller's fallback, which says what did — and did not — change.
 */
export function requestErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    const message = error.message.trim()
    if (message.length > 0 && !/^HTTP \d{3}$/.test(message)) return message
  }
  return fallback
}

/**
 * True when every visible suggestion came from the built-in rules.
 *
 * The optional model service is not configured by default, and an empty mode is
 * not an error: the screen says where the wording came from, quietly, and keeps
 * working. The UI never calls this "AI failure" — it is a source, not a fault.
 */
export function usesBuiltInRules(items: readonly Recommendation[]): boolean {
  return items.length > 0 && items.every((item) => item.source === 'RULE_BASED')
}
