/**
 * Display helpers for the exams view.
 *
 * Everything scale-related comes from the API (`exam.scale`): the maximum, how many
 * decimals to show and what to call the target are resolved server-side, so the
 * screen cannot invent a scoring rule of its own. There is no readiness language
 * here — an exam's status is the status the learner set, and a score is the score
 * they recorded.
 */

import type { ExamStatus, ExamType, ExamWithScale, ExamScoreScale } from '@lingopath/types'
import { formatDayLabel, dayKeyFromInstant } from '@/lib/calendar'
export const EXAM_TYPE_LABELS: Record<ExamType, string> = {
  IELTS: 'IELTS',
  TOEFL: 'TOEFL',
  OTHER: 'Other',
}

export function getExamStatusDisplay(status: ExamStatus): {
  label: string
  className: string
} {
  switch (status) {
    case 'PLANNED':
      return {
        label: 'Planned',
        className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
      }
    case 'REGISTERED':
      return {
        label: 'Registered',
        className: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
      }
    case 'COMPLETED':
      return {
        label: 'Completed',
        className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      }
    case 'CANCELLED':
      return {
        label: 'Cancelled',
        className: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
      }
  }
}

/** `Mon, Nov 2, 2026` for a stored instant. */
export function formatExamDate(instant: string): string {
  return formatDayLabel(dayKeyFromInstant(instant))
}

/**
 * A recorded score, rendered with the precision its own scale reports.
 *
 * Without a scale the value is shown as stored rather than padded to a precision
 * nobody defined.
 */
export function formatScore(value: number | null, scale: ExamScoreScale | null): string {
  if (value === null) return '—'
  return scale ? value.toFixed(scale.decimals) : String(value)
}

export function sectionLabel(scale: ExamScoreScale | null, key: string): string {
  return scale?.sections.find((section) => section.key === key)?.label ?? key
}

/**
 * The most recent recorded result per exam, which is what the card summarises.
 * The API returns results newest first.
 */
export function latestResult(exam: ExamWithScale) {
  return exam.results?.[0] ?? null
}

export interface ExamGroups {
  upcoming: ExamWithScale[]
  past: ExamWithScale[]
}

/**
 * Splits exams for display. "Upcoming" means the learner still has it ahead of
 * them — planned or registered, on a day that has not passed (or with no date set
 * yet). Everything else is finished or called off, and is shown as history.
 *
 * `today` comes from the API, which resolved it in the learner's own timezone.
 */
export function groupExams(exams: readonly ExamWithScale[], today: string): ExamGroups {
  const upcoming: ExamWithScale[] = []
  const past: ExamWithScale[] = []

  for (const exam of exams) {
    const onOrAfterToday = exam.scheduledAt === null || dayKeyFromInstant(exam.scheduledAt) >= today
    const stillAhead = onOrAfterToday && (exam.status === 'PLANNED' || exam.status === 'REGISTERED')

    if (stillAhead) upcoming.push(exam)
    else past.push(exam)
  }

  return { upcoming, past }
}

/** Stable sort for history: most recently taken result first, undated exams last. */
export function sortByExamDateDesc(exams: readonly ExamWithScale[]): ExamWithScale[] {
  return [...exams].sort((a, b) => {
    const left = a.scheduledAt ?? ''
    const right = b.scheduledAt ?? ''
    if (left === right) return 0
    if (left === '') return 1
    if (right === '') return -1
    return right.localeCompare(left)
  })
}
