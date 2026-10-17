'use client'

import { useState } from 'react'
import { Plus, Target } from 'lucide-react'
import type { ObjectiveType } from '@lingopath/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { LoadingState } from '@/components/shared/loading-state'
import { ErrorState } from '@/components/shared/error-state'
import { dayKeyFromInstant, formatDayLabel } from '@/lib/calendar'
import {
  OBJECTIVE_TYPE_LABELS,
  SIGNAL_TONE,
  useActiveObjective,
  useCreateObjective,
  useObjectives,
  useSetActiveObjective,
} from '@/lib/hooks/use-objectives'
import { cn } from '@/lib/utils'

/**
 * The objective everything else follows.
 *
 * Several objectives can exist at once; this card says which one is active, lets the
 * learner change it, and lists the factual signals around it. Every signal shows the
 * value it came from ("Based on: …") — and none of them grades the learner, because
 * this view has no basis for that judgement: there is no readiness rule anywhere in
 * the product, and study time never feeds one.
 */
export function ObjectiveFocusCard() {
  const activeQuery = useActiveObjective()
  const objectivesQuery = useObjectives()
  const setActive = useSetActiveObjective()
  const [createOpen, setCreateOpen] = useState(false)

  if (activeQuery.isLoading || objectivesQuery.isLoading) {
    return <LoadingState label="Loading your objectives..." />
  }

  if (activeQuery.isError || objectivesQuery.isError) {
    return (
      <ErrorState
        title="Could not load your objectives"
        message="The objectives service did not respond."
        onRetry={() => {
          void activeQuery.refetch()
          void objectivesQuery.refetch()
        }}
      />
    )
  }

  const context = activeQuery.data
  const objectives = objectivesQuery.data?.data ?? []
  const objective = context?.objective ?? null

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <Target className="h-4 w-4" />
            Current focus
          </CardTitle>
          <p className="text-muted-foreground mt-1 text-sm">
            Plans, exams and goals default to this objective.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          New objective
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        {objectives.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor="active-objective" className="text-sm font-medium">
              Active objective
            </label>
            <select
              id="active-objective"
              value={objective?.id ?? ''}
              disabled={setActive.isPending}
              onChange={(event) => {
                setActive.mutate(event.target.value === '' ? null : event.target.value)
              }}
              className="border-input bg-background focus-visible:ring-ring h-9 rounded-md border px-3 text-sm focus-visible:outline-none focus-visible:ring-2"
            >
              <option value="">No objective selected</option>
              {objectives.map((entry) => (
                <option key={entry.id} value={entry.id} disabled={!entry.isActive}>
                  {entry.title} · {OBJECTIVE_TYPE_LABELS[entry.type]}
                  {entry.isActive ? '' : ' (inactive)'}
                </option>
              ))}
            </select>
          </div>
        )}

        {objective === null ? (
          <p className="text-muted-foreground text-sm">
            {context?.status === 'NONE_SET'
              ? 'You have objectives, but none is set as active. Choose one above to make plans and exams default to it.'
              : 'No objective yet. Create one — IELTS, TOEFL, General English, immigration or something custom — and it becomes the target everything else follows.'}
          </p>
        ) : (
          <div className="space-y-3">
            <div>
              <p className="text-base font-semibold">{objective.title}</p>
              <p className="text-muted-foreground text-sm">
                {OBJECTIVE_TYPE_LABELS[objective.type]}
                {objective.targetScore !== null && ` · target ${objective.targetScore}`}
                {objective.targetDate !== null &&
                  ` · target date ${formatDayLabel(dayKeyFromInstant(objective.targetDate))}`}
              </p>
            </div>

            {context?.daysUntilTargetDate !== null && context?.daysUntilTargetDate !== undefined && (
              <p className="text-sm">
                {context.daysUntilTargetDate < 0
                  ? `The target date you set has passed (${Math.abs(context.daysUntilTargetDate)} days ago).`
                  : `${context.daysUntilTargetDate} ${context.daysUntilTargetDate === 1 ? 'day' : 'days'} until your target date.`}
              </p>
            )}
          </div>
        )}

        {context && context.signals.length > 0 && (
          <ul className="space-y-2">
            {context.signals.map((signal) => (
              <li
                key={signal.id}
                className={cn('rounded-md border p-3', SIGNAL_TONE[signal.kind] ?? 'bg-muted/40')}
              >
                <p className="text-sm font-medium">{signal.title}</p>
                <p className="text-muted-foreground mt-1 text-sm">{signal.detail}</p>
                <p className="text-muted-foreground/80 mt-1 text-xs">Based on: {signal.basedOn}</p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <CreateObjectiveDialog open={createOpen} onOpenChange={setCreateOpen} />
    </Card>
  )
}

interface CreateObjectiveDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function CreateObjectiveDialog({ open, onOpenChange }: CreateObjectiveDialogProps) {
  const createObjective = useCreateObjective()
  const setActive = useSetActiveObjective()
  const [title, setTitle] = useState('')
  const [type, setType] = useState<ObjectiveType>('IELTS')
  const [targetScore, setTargetScore] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [makeActive, setMakeActive] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const isPending = createObjective.isPending || setActive.isPending

  const submit = async () => {
    setError(null)

    if (title.trim() === '') {
      setError('Give the objective a title.')
      return
    }

    const parsedScore = targetScore.trim() === '' ? undefined : Number(targetScore)
    if (parsedScore !== undefined && !Number.isFinite(parsedScore)) {
      setError('Target score must be a number.')
      return
    }

    try {
      const created = await createObjective.mutateAsync({
        type,
        title: title.trim(),
        ...(parsedScore !== undefined ? { targetScore: parsedScore } : {}),
        ...(targetDate.trim() !== ''
          ? { targetDate: `${targetDate.trim()}T00:00:00.000Z` }
          : {}),
      })

      if (makeActive) {
        await setActive.mutateAsync(created.id)
      }

      setTitle('')
      setTargetScore('')
      setTargetDate('')
      onOpenChange(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create the objective')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New objective</DialogTitle>
          <DialogDescription>
            What are you preparing for? You can keep several objectives and switch the active one at
            any time.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label htmlFor="objective-type" className="text-sm font-medium">
              Type
            </label>
            <select
              id="objective-type"
              value={type}
              onChange={(event) => setType(event.target.value as ObjectiveType)}
              className="border-input bg-background focus-visible:ring-ring mt-1 flex h-10 w-full rounded-md border px-3 text-sm focus-visible:outline-none focus-visible:ring-2"
            >
              {(Object.keys(OBJECTIVE_TYPE_LABELS) as ObjectiveType[]).map((option) => (
                <option key={option} value={option}>
                  {OBJECTIVE_TYPE_LABELS[option]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="objective-title" className="text-sm font-medium">
              Title
            </label>
            <input
              id="objective-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={150}
              className="border-input bg-background focus-visible:ring-ring mt-1 flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2"
              placeholder="e.g. IELTS 7.5 for university application"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="objective-score" className="text-sm font-medium">
                Target score (optional)
              </label>
              <input
                id="objective-score"
                type="number"
                step="0.5"
                value={targetScore}
                onChange={(event) => setTargetScore(event.target.value)}
                className="border-input bg-background focus-visible:ring-ring mt-1 flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2"
                placeholder="e.g. 7.5"
              />
            </div>
            <div>
              <label htmlFor="objective-date" className="text-sm font-medium">
                Target date (optional)
              </label>
              <input
                id="objective-date"
                type="date"
                value={targetDate}
                onChange={(event) => setTargetDate(event.target.value)}
                className="border-input bg-background focus-visible:ring-ring mt-1 flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={makeActive}
              onChange={(event) => setMakeActive(event.target.checked)}
              className="h-4 w-4"
            />
            Make this my active objective
          </label>

          {error && <div className="bg-destructive/10 text-destructive rounded-md p-3 text-sm">{error}</div>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={isPending}>
            {isPending ? 'Creating...' : 'Create objective'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
