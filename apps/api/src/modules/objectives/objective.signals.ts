/**
 * Signals for the active objective (Phase 9).
 *
 * A signal is a *factual observation* about the objective the learner is currently
 * working towards — never an assessment of the learner. Three rules make that
 * boundary concrete, and a guard test enforces the vocabulary:
 *
 * 1. **Never derived from study time.** This module has no access to
 *    `StudySession`, so no amount of practice can create, change or remove a
 *    signal. Study hours do not become a level, a readiness verdict or a score
 *    prediction here.
 * 2. **No verdicts.** There is no ready / not ready / weak / strong / behind
 *    language, no predicted band and no pass probability. A signal either states a
 *    recorded fact ("latest recorded overall: 6.5") or names what is missing ("no
 *    exam is linked to this objective").
 * 3. **Every signal names its basis.** `basedOn` carries the explicit value the
 *    observation came from, so the UI can show why it appeared. An observation
 *    whose basis cannot be named does not belong in this module.
 *
 * Ordering is deterministic (rejections first, then configuration gaps, then
 * timeline, then recorded values) so the list does not reshuffle between reads.
 */

import type { ExamStatus, ObjectiveSignal, ObjectiveType } from '@lingopath/types'

/** Exam-based objectives are the ones where a linked exam is a real expectation. */
const EXAM_BASED_TYPES: readonly ObjectiveType[] = ['IELTS', 'TOEFL']

export interface SignalObjective {
  title: string
  type: ObjectiveType
  targetScore: number | null
  /** Day key (`YYYY-MM-DD`) in the learner's timezone, or `null` when unset. */
  targetDate: string | null
}

export interface SignalExam {
  id: string
  title: string
  status: ExamStatus
  targetScore: number | null
}

export interface SignalRecordedResult {
  examId: string
  examTitle: string
  /** Day key (`YYYY-MM-DD`) in the learner's timezone. */
  takenOn: string
  isMock: boolean
  overallScore: number | null
}

export interface ObjectiveSignalInput {
  /** `null` when no objective is designated as the focus. */
  objective: SignalObjective | null
  /** Whether the learner has any objective at all — distinguishes "none set" from "none created". */
  hasAnyObjective: boolean
  /** Today in the learner's timezone, `YYYY-MM-DD`. */
  today: string
  daysUntilTargetDate: number | null
  linkedPlanCount: number
  linkedGoalCount: number
  linkedExams: SignalExam[]
  latestRecordedResult: SignalRecordedResult | null
  /** Whether any CEFR assessment has been recorded. */
  hasAnyAssessment: boolean
}

export function buildObjectiveSignals(input: ObjectiveSignalInput): ObjectiveSignal[] {
  const signals: ObjectiveSignal[] = []
  const { objective } = input

  if (!objective) {
    signals.push(
      input.hasAnyObjective
        ? {
            id: 'no-active-objective',
            kind: 'OBJECTIVE',
            title: 'Choose the objective you are working towards',
            detail:
              'You have objectives, but none is set as the active one. Plans, exams and goals default to the active objective.',
            basedOn: 'No objective is designated as active on your profile.',
          }
        : {
            id: 'no-objectives',
            kind: 'OBJECTIVE',
            title: 'Create your first objective',
            detail:
              'Objectives describe what you are preparing for — IELTS, TOEFL, General English or immigration — and each one can carry its own target and date.',
            basedOn: 'No learning objective exists for this account.',
          },
    )

    return signals
  }

  if (objective.targetDate === null) {
    signals.push({
      id: 'target-date-missing',
      kind: 'DATA_GAP',
      title: 'Add a target date',
      detail: `"${objective.title}" has no target date, so there is nothing to count down to.`,
      basedOn: 'The active objective has no target date.',
    })
  } else if (input.daysUntilTargetDate !== null && input.daysUntilTargetDate < 0) {
    signals.push({
      id: 'target-date-passed',
      kind: 'TIMELINE',
      title: 'Target date has passed',
      detail: `The target date you set for "${objective.title}" was ${objective.targetDate}. Today is ${input.today}.`,
      basedOn: `Recorded target date ${objective.targetDate} against today (${input.today}) in your timezone.`,
    })
  } else if (
    input.daysUntilTargetDate !== null &&
    input.daysUntilTargetDate >= 0 &&
    input.daysUntilTargetDate <= 30
  ) {
    signals.push({
      id: 'target-date-soon',
      kind: 'TIMELINE',
      title: `${input.daysUntilTargetDate} day${input.daysUntilTargetDate === 1 ? '' : 's'} until your target date`,
      detail: `"${objective.title}" is dated ${objective.targetDate}. Today is ${input.today}.`,
      basedOn: `Recorded target date ${objective.targetDate} against today (${input.today}) in your timezone.`,
    })
  }

  if (input.linkedPlanCount === 0) {
    signals.push({
      id: 'no-linked-plan',
      kind: 'DATA_GAP',
      title: 'No long-term plan points at this objective',
      detail: `Create a plan and it will default to "${objective.title}", so the sessions you log against it count towards this objective.`,
      basedOn: 'No long-term plan is linked to the active objective.',
    })
  }

  if (EXAM_BASED_TYPES.includes(objective.type)) {
    if (input.linkedExams.length === 0) {
      signals.push({
        id: 'no-linked-exam',
        kind: 'DATA_GAP',
        title: `No ${objective.type} exam is linked`,
        detail:
          'Add the exam you are preparing for (with its date and target band or score) and its results become the recorded evidence for this objective.',
        basedOn: 'No exam is linked to the active objective.',
      })
    } else if (input.latestRecordedResult === null) {
      signals.push({
        id: 'no-recorded-result',
        kind: 'DATA_GAP',
        title: 'No result recorded for these exams yet',
        detail: `You have ${input.linkedExams.length} linked exam${input.linkedExams.length === 1 ? '' : 's'}, none with a result. A mock result is recorded the same way as a real one.`,
        basedOn: 'Linked exams exist but carry no recorded result.',
      })
    }
  }

  const result = input.latestRecordedResult
  const targetOfResultExam =
    result === null
      ? undefined
      : input.linkedExams.find((exam) => exam.id === result.examId && exam.targetScore !== null)

  if (result !== null && result.overallScore !== null && targetOfResultExam) {
    signals.push({
      id: 'target-vs-recorded',
      kind: 'RECORDED_SCORE',
      title: 'Target and latest recorded result',
      detail: `You set a target of ${targetOfResultExam.targetScore} for "${targetOfResultExam.title}". Your latest recorded overall is ${result.overallScore} (${result.isMock ? 'mock' : 'real'} exam, recorded for ${result.takenOn}).`,
      basedOn:
        'Both numbers are values you recorded; LingoPath does not turn them into a readiness verdict.',
    })
  }

  if (!input.hasAnyAssessment) {
    signals.push({
      id: 'no-level-assessment',
      kind: 'DATA_GAP',
      title: 'No CEFR assessment recorded',
      detail:
        'Record an assessment on the Levels page to state your own overall, listening, reading, writing or speaking level. Levels are only ever the ones you record — LingoPath never estimates one.',
      basedOn: 'No level assessment is recorded for this account.',
    })
  }

  return signals
}
