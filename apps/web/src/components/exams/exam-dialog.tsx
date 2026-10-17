'use client'

import { useEffect, useState } from 'react'
import type { ExamStatus, ExamType, ExamWithScale } from '@lingopath/types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useCreateExam, useExamScales, useUpdateExam, type ExamInput } from '@/lib/hooks/use-exams'
import { useActiveObjective, useObjectives } from '@/lib/hooks/use-objectives'
import { dateInputValue } from '@/lib/calendar'
import { EXAM_TYPE_LABELS, getExamStatusDisplay } from '@/lib/exams'

interface ExamDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Present when editing an existing exam. */
  exam?: ExamWithScale | null
}

const STATUSES: ExamStatus[] = ['PLANNED', 'REGISTERED', 'COMPLETED', 'CANCELLED']

/**
 * Creates or edits an exam.
 *
 * The objective field defaults to the active objective — that is how the current
 * focus reaches planning — and the scoring scale defaults to whatever the API says
 * this exam type uses, so the target is labelled as a band or a score accordingly.
 */
export function ExamDialog({ open, onOpenChange, exam = null }: ExamDialogProps) {
  const createExam = useCreateExam()
  const updateExam = useUpdateExam()
  const scalesQuery = useExamScales()
  const objectivesQuery = useObjectives()
  const activeQuery = useActiveObjective()

  const [title, setTitle] = useState('')
  const [type, setType] = useState<ExamType>('IELTS')
  const [status, setStatus] = useState<ExamStatus>('PLANNED')
  const [scheduledAt, setScheduledAt] = useState('')
  const [targetScore, setTargetScore] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [scaleKey, setScaleKey] = useState('')
  const [objectiveId, setObjectiveId] = useState('')
  const [venue, setVenue] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  const activeObjectiveId = activeQuery.data?.objective?.id ?? ''

  useEffect(() => {
    if (!open) return

    setTitle(exam?.title ?? '')
    setType(exam?.type ?? 'IELTS')
    setStatus(exam?.status ?? 'PLANNED')
    setScheduledAt(exam?.scheduledAt ? dateInputValue(exam.scheduledAt) : '')
    setTargetScore(exam?.targetScore !== null && exam?.targetScore !== undefined ? String(exam.targetScore) : '')
    setTargetDate(exam?.targetDate ? dateInputValue(exam.targetDate) : '')
    setScaleKey(exam?.scoreScale?.key ?? '')
    // Editing keeps the exam's own link; creating starts from the active objective.
    setObjectiveId(exam ? (exam.objectiveId ?? '') : activeObjectiveId)
    setVenue(exam?.venue ?? '')
    setNotes(exam?.notes ?? '')
    setError(null)
  }, [open, exam, activeObjectiveId])

  const isPending = createExam.isPending || updateExam.isPending
  const defaults = scalesQuery.data?.defaults
  const scales = scalesQuery.data?.data ?? []
  const effectiveScaleKey = scaleKey !== '' ? scaleKey : ((defaults?.[type] as string | null) ?? null)
  const effectiveScale = scales.find((entry) => entry.key === effectiveScaleKey) ?? null
  const targetLabel = effectiveScale?.targetLabel ?? 'Target score'

  const submit = async () => {
    setError(null)

    if (title.trim() === '') {
      setError('Give the exam a title.')
      return
    }

    let parsedTarget: number | null = null
    if (targetScore.trim() !== '') {
      parsedTarget = Number(targetScore)
      if (!Number.isFinite(parsedTarget)) {
        setError(`${targetLabel} must be a number.`)
        return
      }
      if (effectiveScale) {
        if (effectiveScale.max !== null && parsedTarget > effectiveScale.max) {
          setError(`${targetLabel} must be between ${effectiveScale.min} and ${effectiveScale.max}.`)
          return
        }
        if (parsedTarget < effectiveScale.min) {
          setError(`${targetLabel} must be between ${effectiveScale.min} and ${effectiveScale.max}.`)
          return
        }
      }
    }

    const payload: ExamInput = {
      type,
      title: title.trim(),
      status,
      objectiveId: objectiveId === '' ? null : objectiveId,
      scheduledAt: scheduledAt.trim() === '' ? null : `${scheduledAt.trim()}T00:00:00.000Z`,
      venue: venue.trim() === '' ? null : venue.trim(),
      targetScore: parsedTarget,
      targetDate: targetDate.trim() === '' ? null : `${targetDate.trim()}T00:00:00.000Z`,
      scoreScale: scaleKey === '' ? null : { key: scaleKey },
      notes: notes.trim() === '' ? null : notes.trim(),
    }

    try {
      if (exam) {
        await updateExam.mutateAsync({ id: exam.id, data: payload })
      } else {
        await createExam.mutateAsync(payload)
      }
      onOpenChange(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the exam')
    }
  }

  const objectives = (objectivesQuery.data?.data ?? []).filter((entry) => entry.isActive)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{exam ? 'Edit exam' : 'Add an exam'}</DialogTitle>
          <DialogDescription>
            Record the exam you are preparing for, when it is, and the target you set for it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label htmlFor="exam-title" className="text-sm font-medium">
              Title
            </label>
            <input
              id="exam-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={150}
              className="border-input bg-background focus-visible:ring-ring mt-1 flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2"
              placeholder="e.g. IELTS Academic (British Council)"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="exam-type" className="text-sm font-medium">
                Type
              </label>
              <select
                id="exam-type"
                value={type}
                onChange={(event) => {
                  setType(event.target.value as ExamType)
                  setScaleKey('')
                }}
                className="border-input bg-background focus-visible:ring-ring mt-1 flex h-10 w-full rounded-md border px-3 text-sm focus-visible:outline-none focus-visible:ring-2"
              >
                {(Object.keys(EXAM_TYPE_LABELS) as ExamType[]).map((option) => (
                  <option key={option} value={option}>
                    {EXAM_TYPE_LABELS[option]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="exam-status" className="text-sm font-medium">
                Status
              </label>
              <select
                id="exam-status"
                value={status}
                onChange={(event) => setStatus(event.target.value as ExamStatus)}
                className="border-input bg-background focus-visible:ring-ring mt-1 flex h-10 w-full rounded-md border px-3 text-sm focus-visible:outline-none focus-visible:ring-2"
              >
                {STATUSES.map((option) => (
                  <option key={option} value={option}>
                    {getExamStatusDisplay(option).label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="exam-date" className="text-sm font-medium">
                Test date
              </label>
              <input
                id="exam-date"
                type="date"
                value={scheduledAt}
                onChange={(event) => setScheduledAt(event.target.value)}
                className="border-input bg-background focus-visible:ring-ring mt-1 flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2"
              />
            </div>
            <div>
              <label htmlFor="exam-venue" className="text-sm font-medium">
                Venue (optional)
              </label>
              <input
                id="exam-venue"
                value={venue}
                onChange={(event) => setVenue(event.target.value)}
                maxLength={200}
                className="border-input bg-background focus-visible:ring-ring mt-1 flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2"
                placeholder="e.g. Test centre, Tehran"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label htmlFor="exam-scale" className="text-sm font-medium">
                Scoring scale
              </label>
              <select
                id="exam-scale"
                value={scaleKey}
                onChange={(event) => setScaleKey(event.target.value)}
                className="border-input bg-background focus-visible:ring-ring mt-1 flex h-10 w-full rounded-md border px-3 text-sm focus-visible:outline-none focus-visible:ring-2"
              >
                <option value="">
                  {defaults?.[type] ? 'Default for this type' : 'Unscored'}
                </option>
                {scales.map((scale) => (
                  <option key={scale.key} value={scale.key}>
                    {scale.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="exam-target" className="text-sm font-medium">
                {targetLabel}
              </label>
              <input
                id="exam-target"
                type="number"
                step={effectiveScale?.step ?? 1}
                value={targetScore}
                onChange={(event) => setTargetScore(event.target.value)}
                className="border-input bg-background focus-visible:ring-ring mt-1 flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2"
                placeholder={effectiveScale ? `0–${effectiveScale.max ?? '∞'}` : 'e.g. 7.5'}
              />
            </div>
            <div>
              <label htmlFor="exam-target-date" className="text-sm font-medium">
                Target date
              </label>
              <input
                id="exam-target-date"
                type="date"
                value={targetDate}
                onChange={(event) => setTargetDate(event.target.value)}
                className="border-input bg-background focus-visible:ring-ring mt-1 flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2"
              />
            </div>
          </div>

          <div>
            <label htmlFor="exam-objective" className="text-sm font-medium">
              Objective
            </label>
            <select
              id="exam-objective"
              value={objectiveId}
              onChange={(event) => setObjectiveId(event.target.value)}
              className="border-input bg-background focus-visible:ring-ring mt-1 flex h-10 w-full rounded-md border px-3 text-sm focus-visible:outline-none focus-visible:ring-2"
            >
              <option value="">No objective linked</option>
              {objectives.map((objective) => (
                <option key={objective.id} value={objective.id}>
                  {objective.title}
                  {objective.id === activeObjectiveId ? ' (active)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="exam-notes" className="text-sm font-medium">
              Notes (optional)
            </label>
            <textarea
              id="exam-notes"
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="border-input bg-background focus-visible:ring-ring mt-1 flex w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2"
              placeholder="Registration number, test module, anything worth remembering"
            />
          </div>

          {error && (
            <div className="bg-destructive/10 text-destructive rounded-md p-3 text-sm">{error}</div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={isPending}>
            {isPending ? 'Saving...' : exam ? 'Save changes' : 'Add exam'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
