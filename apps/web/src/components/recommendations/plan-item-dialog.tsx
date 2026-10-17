'use client'

/**
 * The confirmation step, and the only place planning data can change.
 *
 * Opening this dialog does nothing. Nothing is written until the learner presses
 * "Add to today’s plan", and what is written is exactly one daily goal for the
 * day shown — the API additionally refuses any apply without `confirm: true`.
 *
 * `Modify` is the same dialog in an editable mode rather than a second flow, so
 * there is one summary, one confirmation question and one submit path. Changing
 * the duration, skill, topic or day never saves anything by itself.
 */

import { useEffect, useState } from 'react'
import type { Recommendation } from '@lingopath/types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useSkills } from '@/lib/hooks/use-skills'
import { useApplyRecommendation, useRecommendationFeedback } from '@/lib/hooks/use-recommendations'
import {
  MAX_PLAN_DURATION_MINUTES,
  MIN_PLAN_DURATION_MINUTES,
  PLAN_DRAFT_FIELD_LABELS,
  describePlanItem,
  draftChangedFields,
  draftFor,
  isDateInputValue,
  requestErrorMessage,
  sanitizeDuration,
  todayInputValue,
  toApplyInput,
  type PlanDraft,
} from '@/lib/recommendations'

const INPUT_CLASS =
  'border-input bg-background ring-offset-background focus-visible:ring-ring mt-1 flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2'

interface PlanItemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  recommendation: Recommendation | null
  /** `confirm` shows the proposed item; `modify` opens on the fields. */
  initialMode: 'confirm' | 'modify'
  onAdded: (message: string) => void
}

export function PlanItemDialog({
  open,
  onOpenChange,
  recommendation,
  initialMode,
  onAdded,
}: PlanItemDialogProps) {
  const feedback = useRecommendationFeedback()
  const apply = useApplyRecommendation()
  const skills = useSkills(open)

  const [mode, setMode] = useState<'confirm' | 'modify'>(initialMode)
  const [draft, setDraft] = useState<PlanDraft | null>(null)
  const [durationInput, setDurationInput] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || recommendation === null) return
    const next = draftFor(recommendation, todayInputValue())
    setDraft(next)
    setDurationInput(String(next.durationMinutes))
    setMode(initialMode)
    setError(null)
  }, [open, recommendation, initialMode])

  const isPending = feedback.isPending || apply.isPending
  const skillName =
    draft === null ? null : (skills.data?.find((skill) => skill.id === draft.skillId)?.name ?? null)
  // The summary follows what is currently typed, not the last saved draft: a
  // learner who types 65 minutes sees 1h 5m before they confirm.
  const preview =
    draft === null ? null : { ...draft, durationMinutes: sanitizeDuration(durationInput) }
  const summary = preview === null ? '' : describePlanItem(preview, skillName)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (recommendation === null || draft === null) return

    setError(null)
    const duration = Number.parseInt(durationInput, 10)
    if (
      !Number.isFinite(duration) ||
      duration < MIN_PLAN_DURATION_MINUTES ||
      duration > MAX_PLAN_DURATION_MINUTES
    ) {
      setError(
        `Enter a duration between ${MIN_PLAN_DURATION_MINUTES} and ${MAX_PLAN_DURATION_MINUTES} minutes.`,
      )
      return
    }
    if (!isDateInputValue(draft.date)) {
      setError('Choose a valid day.')
      return
    }

    const finalDraft: PlanDraft = { ...draft, durationMinutes: sanitizeDuration(duration) }
    const base = draftFor(recommendation, todayInputValue())
    const changed = draftChangedFields(finalDraft, base)

    // A new suggestion needs its decision recorded first; an already-accepted one
    // only needs it again if the learner adjusted something here.
    if (recommendation.status === 'NEW' || changed.length > 0) {
      try {
        await feedback.mutateAsync({
          id: recommendation.id,
          action: changed.length > 0 ? 'MODIFIED' : 'ACCEPTED',
          ...(changed.length > 0
            ? {
                reason: `Adjusted before confirming: ${changed
                  .map((field) => PLAN_DRAFT_FIELD_LABELS[field])
                  .join(', ')}`,
              }
            : {}),
        })
      } catch (error) {
        setError(
          requestErrorMessage(
            error,
            'Your decision could not be recorded. Nothing was added to your plan.',
          ),
        )
        return
      }
    }

    try {
      await apply.mutateAsync({ id: recommendation.id, input: toApplyInput(finalDraft) })
      onAdded(`Added to your plan: ${describePlanItem(finalDraft, skillName)}.`)
      onOpenChange(false)
    } catch (error) {
      setError(
        requestErrorMessage(
          error,
          'The item could not be added to your plan. Your decision is recorded and nothing else was changed.',
        ),
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add this to today’s plan?</DialogTitle>
          <DialogDescription>
            This adds one daily goal for the day shown. No study session is created and no existing
            plan is edited.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
          {error !== null && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}

          {draft !== null &&
            (mode === 'confirm' ? (
              <div className="border-border rounded-lg border p-4">
                <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                  Proposed item
                </p>
                <p className="text-foreground mt-1 font-medium">{summary}</p>
                {recommendation !== null && (
                  <p className="text-muted-foreground mt-2 text-sm">{recommendation.title}</p>
                )}
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="mt-1 h-auto px-0"
                  onClick={() => setMode('modify')}
                >
                  Change duration, skill, topic or day
                </Button>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="plan-duration" className="text-sm font-medium">
                    Duration (minutes)
                  </label>
                  <input
                    id="plan-duration"
                    type="number"
                    min={MIN_PLAN_DURATION_MINUTES}
                    max={MAX_PLAN_DURATION_MINUTES}
                    step={5}
                    value={durationInput}
                    onChange={(event) => setDurationInput(event.target.value)}
                    className={INPUT_CLASS}
                  />
                  {recommendation?.estimatedDurationMinutes === null && (
                    <p className="text-muted-foreground mt-1 text-xs">
                      No duration was attached to this suggestion.
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="plan-skill" className="text-sm font-medium">
                    Skill
                  </label>
                  <select
                    id="plan-skill"
                    value={draft.skillId ?? ''}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        skillId: event.target.value === '' ? null : event.target.value,
                      })
                    }
                    className={INPUT_CLASS}
                  >
                    <option value="">No specific skill</option>
                    {(skills.data ?? []).map((skill) => (
                      <option key={skill.id} value={skill.id}>
                        {skill.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="plan-date" className="text-sm font-medium">
                    Day
                  </label>
                  <input
                    id="plan-date"
                    type="date"
                    value={draft.date}
                    onChange={(event) => setDraft({ ...draft, date: event.target.value })}
                    className={INPUT_CLASS}
                  />
                </div>

                <div>
                  <label htmlFor="plan-topic" className="text-sm font-medium">
                    Topic (optional)
                  </label>
                  <input
                    id="plan-topic"
                    type="text"
                    maxLength={120}
                    value={draft.topic}
                    onChange={(event) => setDraft({ ...draft, topic: event.target.value })}
                    placeholder="e.g. IELTS Task 2"
                    className={INPUT_CLASS}
                  />
                </div>

                <div className="sm:col-span-2">
                  <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                    Adds
                  </p>
                  <p className="text-foreground mt-1 text-sm font-medium">{summary}</p>
                </div>
              </div>
            ))}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              {mode === 'confirm' ? 'Not now' : 'Cancel'}
            </Button>
            <Button type="submit" disabled={isPending || draft === null}>
              {isPending ? 'Adding…' : 'Add to today’s plan'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
