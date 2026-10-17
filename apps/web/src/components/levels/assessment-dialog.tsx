'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import type { AssessmentMethod, CefrLevel, LevelAssessmentEntry, LevelDimension } from '@lingopath/types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useCreateAssessment, useUpdateAssessment, type AssessmentInput } from '@/lib/hooks/use-levels'
import { dateInputValue, todayInputValue } from '@/lib/calendar'
import { dimensionLabel, levelsByRank, METHOD_LABELS } from '@/lib/levels'

interface AssessmentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  dimensions: LevelDimension[]
  rankByLevel: Record<CefrLevel, number>
  /** Present when editing an existing recording. */
  assessment?: LevelAssessmentEntry | null
}

interface FormValues {
  assessedAt: string
  method: AssessmentMethod
  notes: string
  overall: CefrLevel | ''
  listening: CefrLevel | ''
  reading: CefrLevel | ''
  writing: CefrLevel | ''
  speaking: CefrLevel | ''
}

const DIMENSION_FORM_FIELD: Record<LevelDimension, keyof FormValues> = {
  overall: 'overall',
  listening: 'listening',
  reading: 'reading',
  writing: 'writing',
  speaking: 'speaking',
}

/** Sentinel for "Not assessed" in the level selectors. */
const EMPTY_DIMENSION = ''

function toFormValues(assessment: LevelAssessmentEntry | null | undefined): FormValues {
  const levels = assessment?.levels

  return {
    assessedAt: assessment ? dateInputValue(assessment.assessedAt) : todayInputValue(),
    method: assessment?.method ?? 'SELF_REPORTED',
    notes: assessment?.notes ?? '',
    overall: levels?.overall ?? EMPTY_DIMENSION,
    listening: levels?.listening ?? EMPTY_DIMENSION,
    reading: levels?.reading ?? EMPTY_DIMENSION,
    writing: levels?.writing ?? EMPTY_DIMENSION,
    speaking: levels?.speaking ?? EMPTY_DIMENSION,
  }
}

/**
 * Records or edits one CEFR assessment.
 *
 * Every dimension is optional and starts unset: the form only reports what the
 * learner actually knows about themselves. "Not assessed" is a real answer, and the
 * dialog refuses to save an assessment that records nothing at all.
 */
export function AssessmentDialog({
  open,
  onOpenChange,
  dimensions,
  rankByLevel,
  assessment = null,
}: AssessmentDialogProps) {
  const createAssessment = useCreateAssessment()
  const updateAssessment = useUpdateAssessment()
  const [serverError, setServerError] = useState<string | null>(null)
  const levels = levelsByRank(rankByLevel)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ defaultValues: toFormValues(assessment) })

  useEffect(() => {
    if (open) {
      reset(toFormValues(assessment))
      setServerError(null)
    }
  }, [open, assessment, reset])

  const isPending = createAssessment.isPending || updateAssessment.isPending

  const onSubmit = async (values: FormValues) => {
    setServerError(null)

    // The form's dimension-keyed answers, with "Not assessed" normalised to `null`.
    const levelsByDimension = Object.fromEntries(
      dimensions.map((dimension) => {
        const level = values[DIMENSION_FORM_FIELD[dimension]]
        return [dimension, level === EMPTY_DIMENSION ? null : level]
      }),
    ) as Record<LevelDimension, CefrLevel | null>

    if (!Object.values(levelsByDimension).some((level) => level !== null)) {
      setServerError('Record at least one level — an assessment with no levels has nothing to show.')
      return
    }

    // Every dimension is sent, so clearing one is an explicit `null` rather than an
    // omission the server would read as "leave it unchanged".
    const payload: AssessmentInput = {
      cefrLevel: levelsByDimension.overall,
      listeningLevel: levelsByDimension.listening,
      readingLevel: levelsByDimension.reading,
      writingLevel: levelsByDimension.writing,
      speakingLevel: levelsByDimension.speaking,
      assessedAt: `${values.assessedAt}T00:00:00.000Z`,
      method: values.method,
      notes: values.notes.trim() === '' ? null : values.notes.trim(),
    }

    try {
      if (assessment) {
        await updateAssessment.mutateAsync({ id: assessment.id, data: payload })
      } else {
        await createAssessment.mutateAsync(payload)
      }
      reset(toFormValues(null))
      onOpenChange(false)
    } catch (error) {
      setServerError(error instanceof Error ? error.message : 'Could not save the assessment')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{assessment ? 'Edit assessment' : 'Record an assessment'}</DialogTitle>
          <DialogDescription>
            Record a CEFR level for the dimensions you have been assessed on. Leave the others as
            “Not assessed” — a level is only ever the one you record.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="assessedAt" className="text-sm font-medium">
                Date
              </label>
              <input
                id="assessedAt"
                type="date"
                {...register('assessedAt', { required: 'Date is required' })}
                className="border-input bg-background ring-offset-background focus-visible:ring-ring mt-1 flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              />
              {errors.assessedAt && (
                <p className="text-destructive mt-1 text-xs">{errors.assessedAt.message}</p>
              )}
            </div>
            <div>
              <label htmlFor="method" className="text-sm font-medium">
                Method
              </label>
              <select
                id="method"
                {...register('method')}
                className="border-input bg-background ring-offset-background focus-visible:ring-ring mt-1 flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              >
                {(Object.keys(METHOD_LABELS) as AssessmentMethod[]).map((method) => (
                  <option key={method} value={method}>
                    {METHOD_LABELS[method]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Levels</legend>
            {dimensions.map((dimension) => {
              const field = DIMENSION_FORM_FIELD[dimension]
              return (
                <div key={dimension} className="flex items-center justify-between gap-3">
                  <label htmlFor={field} className="text-sm">
                    {dimensionLabel(dimension)}
                  </label>
                  <select
                    id={field}
                    {...register(field)}
                    className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-9 w-40 rounded-md border px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                  >
                    <option value={EMPTY_DIMENSION}>Not assessed</option>
                    {levels.map((level) => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </select>
                </div>
              )
            })}
          </fieldset>

          <div>
            <label htmlFor="notes" className="text-sm font-medium">
              Notes (optional)
            </label>
            <textarea
              id="notes"
              rows={3}
              {...register('notes', {
                maxLength: { value: 2000, message: 'Notes must be 2000 characters or less' },
              })}
              className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring mt-1 flex w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              placeholder="e.g. Placement test at the language school"
            />
            {errors.notes && <p className="text-destructive mt-1 text-xs">{errors.notes.message}</p>}
          </div>

          {serverError && (
            <div className="bg-destructive/10 text-destructive rounded-md p-3 text-sm">
              {serverError}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving...' : assessment ? 'Save changes' : 'Record assessment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
