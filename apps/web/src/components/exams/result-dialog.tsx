'use client'

import { useEffect, useState } from 'react'
import type { ExamWithScale } from '@lingopath/types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useAddExamResult } from '@/lib/hooks/use-exams'
import { todayInputValue } from '@/lib/calendar'

interface RecordResultDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  exam: ExamWithScale | null
}

/**
 * Records one result for an exam.
 *
 * The form is built from the exam's own scale: an IELTS exam offers an overall band
 * plus four skills out of 9, a TOEFL exam offers a total plus four sections out of
 * 30, and an unscored exam offers a free-form overall. Scores are stored exactly as
 * entered — the overall is never recomputed from sections, because the reported
 * figure is the one that counts.
 */
export function RecordResultDialog({ open, onOpenChange, exam }: RecordResultDialogProps) {
  const addResult = useAddExamResult()
  const [takenAt, setTakenAt] = useState(todayInputValue())
  const [isMock, setIsMock] = useState(true)
  const [overall, setOverall] = useState('')
  const [sections, setSections] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return

    setTakenAt(todayInputValue())
    setIsMock(true)
    setOverall('')
    setSections({})
    setNotes('')
    setError(null)
  }, [open, exam])

  const scale = exam?.scale ?? null
  const sectionKeys = scale?.sections ?? []

  const submit = async () => {
    setError(null)

    if (!exam) return

    const skillScores: Record<string, number> = {}
    for (const section of sectionKeys) {
      const raw = (sections[section.key] ?? '').trim()
      if (raw === '') continue

      const value = Number(raw)
      if (!Number.isFinite(value)) {
        setError(`${section.label} must be a number.`)
        return
      }
      skillScores[section.key] = value
    }

    let parsedOverall: number | undefined
    if (overall.trim() !== '') {
      parsedOverall = Number(overall)
      if (!Number.isFinite(parsedOverall)) {
        setError('Overall score must be a number.')
        return
      }
    }

    if (parsedOverall === undefined && Object.keys(skillScores).length === 0) {
      setError('Record an overall score, a section score, or both.')
      return
    }

    try {
      await addResult.mutateAsync({
        examId: exam.id,
        data: {
          isMock,
          takenAt: `${takenAt}T00:00:00.000Z`,
          ...(parsedOverall !== undefined ? { overallScore: parsedOverall } : {}),
          ...(Object.keys(skillScores).length > 0 ? { skillScores } : {}),
          ...(notes.trim() !== '' ? { notes: notes.trim() } : {}),
        },
      })
      onOpenChange(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not record the result')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record a result</DialogTitle>
          <DialogDescription>
            {exam ? `${exam.title} · ${scale ? scale.label : 'no scale set'}` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="result-date" className="text-sm font-medium">
                Date
              </label>
              <input
                id="result-date"
                type="date"
                value={takenAt}
                onChange={(event) => setTakenAt(event.target.value)}
                className="border-input bg-background focus-visible:ring-ring mt-1 flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2"
              />
            </div>
            <div>
              <label htmlFor="result-kind" className="text-sm font-medium">
                Kind
              </label>
              <select
                id="result-kind"
                value={isMock ? 'mock' : 'real'}
                onChange={(event) => setIsMock(event.target.value === 'mock')}
                className="border-input bg-background focus-visible:ring-ring mt-1 flex h-10 w-full rounded-md border px-3 text-sm focus-visible:outline-none focus-visible:ring-2"
              >
                <option value="mock">Mock</option>
                <option value="real">Real exam</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="result-overall" className="text-sm font-medium">
              Overall score
              {scale && ` (${scale.min}–${scale.max ?? '∞'})`}
            </label>
            <input
              id="result-overall"
              type="number"
              step={scale?.step ?? 1}
              value={overall}
              onChange={(event) => setOverall(event.target.value)}
              className="border-input bg-background focus-visible:ring-ring mt-1 flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2"
              placeholder="Overall score"
            />
            {scale && (
              <p className="text-muted-foreground mt-1 text-xs">
                Recorded as reported — LingoPath does not recompute an overall from the sections.
              </p>
            )}
          </div>

          {sectionKeys.length > 0 && (
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">Section scores</legend>
              {sectionKeys.map((section) => (
                <div key={section.key} className="flex items-center justify-between gap-3">
                  <label htmlFor={`section-${section.key}`} className="text-sm">
                    {section.label}
                    {section.max !== null && (
                      <span className="text-muted-foreground"> (max {section.max})</span>
                    )}
                  </label>
                  <input
                    id={`section-${section.key}`}
                    type="number"
                    step={scale?.step ?? 1}
                    value={sections[section.key] ?? ''}
                    onChange={(event) =>
                      setSections((current) => ({ ...current, [section.key]: event.target.value }))
                    }
                    className="border-input bg-background focus-visible:ring-ring flex h-9 w-28 rounded-md border px-2 text-sm focus-visible:outline-none focus-visible:ring-2"
                  />
                </div>
              ))}
            </fieldset>
          )}

          <div>
            <label htmlFor="result-notes" className="text-sm font-medium">
              Notes (optional)
            </label>
            <textarea
              id="result-notes"
              rows={2}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="border-input bg-background focus-visible:ring-ring mt-1 flex w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2"
            />
          </div>

          {error && (
            <div className="bg-destructive/10 text-destructive rounded-md p-3 text-sm">{error}</div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={addResult.isPending}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={addResult.isPending}>
            {addResult.isPending ? 'Saving...' : 'Record result'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
