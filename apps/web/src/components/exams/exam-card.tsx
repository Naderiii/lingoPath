'use client'

import { useState } from 'react'
import { CalendarDays, MapPin, Pencil, Plus, Trash2 } from 'lucide-react'
import type { ExamWithScale } from '@lingopath/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ExamProgress } from './exam-progress'
import { dayKeyFromInstant, formatDayLabel } from '@/lib/calendar'
import { EXAM_TYPE_LABELS, formatScore, getExamStatusDisplay, latestResult } from '@/lib/exams'
import { cn } from '@/lib/utils'

interface ExamCardProps {
  exam: ExamWithScale
  onEdit: (exam: ExamWithScale) => void
  onDelete: (id: string) => void
  onRecordResult: (exam: ExamWithScale) => void
  isDeleting?: boolean
}

/**
 * One exam: what it is, when it is, the target that was set, and every result
 * recorded so far.
 *
 * The card reports; it does not judge. There is no "on track" or "ready" badge,
 * because a claim like that would need a rule the product does not have.
 */
export function ExamCard({
  exam,
  onEdit,
  onDelete,
  onRecordResult,
  isDeleting = false,
}: ExamCardProps) {
  const [confirming, setConfirming] = useState(false)
  const status = getExamStatusDisplay(exam.status)
  const result = latestResult(exam)
  const scale = exam.scale

  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base font-semibold">{exam.title}</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <span className="bg-muted text-muted-foreground rounded-md px-2 py-0.5 text-xs font-medium">
                {EXAM_TYPE_LABELS[exam.type]}
              </span>
              <span className={cn('rounded-md px-2 py-0.5 text-xs font-medium', status.className)}>
                {status.label}
              </span>
              {scale && (
                <span className="text-muted-foreground text-xs">{scale.label}</span>
              )}
            </div>
          </div>

          {confirming ? (
            <div className="flex flex-col items-end gap-2">
              <span className="text-muted-foreground text-xs">
                Delete this exam and its recorded results?
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setConfirming(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={isDeleting}
                  onClick={() => {
                    setConfirming(false)
                    onDelete(exam.id)
                  }}
                >
                  Delete
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-1">
              <Button variant="outline" size="sm" onClick={() => onRecordResult(exam)}>
                <Plus className="h-3.5 w-3.5" />
                Record result
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onEdit(exam)}
                aria-label={`Edit ${exam.title}`}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirming(true)}
                aria-label={`Delete ${exam.title}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <dl className="grid gap-3 sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground text-xs">Test date</dt>
            <dd className="text-sm font-medium">
              {exam.scheduledAt === null ? 'Not set' : formatDayLabel(dayKeyFromInstant(exam.scheduledAt))}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">
              {scale ? scale.targetLabel : 'Target'}
            </dt>
            <dd className="text-sm font-medium">
              {exam.targetScore === null ? 'Not set' : formatScore(exam.targetScore, scale)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Target date</dt>
            <dd className="text-sm font-medium">
              {exam.targetDate === null ? 'Not set' : formatDayLabel(dayKeyFromInstant(exam.targetDate))}
            </dd>
          </div>
        </dl>

        <div className="text-muted-foreground flex flex-wrap items-center gap-4 text-xs">
          {exam.venue && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
              {exam.venue}
            </span>
          )}
          <span className="flex items-center gap-1">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
            {exam.objective ? `Objective: ${exam.objective.title}` : 'No objective linked'}
          </span>
        </div>

        {result ? (
          <p className="text-sm">
            Latest recorded overall:{' '}
            <span className="font-semibold">{formatScore(result.overallScore, scale)}</span>{' '}
            <span className="text-muted-foreground">
              ({result.isMock ? 'mock' : 'real'} exam, taken{' '}
              {formatDayLabel(dayKeyFromInstant(result.takenAt))})
            </span>
          </p>
        ) : (
          <p className="text-muted-foreground text-sm">
            No result recorded for this exam yet. A mock result is recorded the same way as a real
            one.
          </p>
        )}

        <ExamProgress exam={exam} />

        {exam.notes && <p className="text-muted-foreground text-sm">{exam.notes}</p>}
      </CardContent>
    </Card>
  )
}
