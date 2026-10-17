'use client'

import { useState } from 'react'
import { FileText, Info, Plus } from 'lucide-react'
import type { ExamStatus, ExamType, ExamWithScale } from '@lingopath/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/shared/empty-state'
import { ErrorState } from '@/components/shared/error-state'
import { LoadingState } from '@/components/shared/loading-state'
import { ExamCard } from './exam-card'
import { ExamDialog } from './exam-dialog'
import { RecordResultDialog } from './result-dialog'
import { useDeleteExam, useExams } from '@/lib/hooks/use-exams'
import { OBJECTIVE_TYPE_LABELS, useActiveObjective } from '@/lib/hooks/use-objectives'
import { EXAM_TYPE_LABELS, groupExams, sortByExamDateDesc } from '@/lib/exams'

const STATUS_FILTERS: Array<{ label: string; value: ExamStatus | 'ALL' }> = [
  { label: 'All statuses', value: 'ALL' },
  { label: 'Planned', value: 'PLANNED' },
  { label: 'Registered', value: 'REGISTERED' },
  { label: 'Completed', value: 'COMPLETED' },
  { label: 'Cancelled', value: 'CANCELLED' },
]

/**
 * Exams and their recorded results.
 *
 * Grouping into "ahead of you" and "history" uses the day the API resolved in the
 * learner's own timezone, so the two sides of the split cannot disagree with the
 * target countdown shown on the levels page.
 */
export function ExamsPageClient() {
  const [typeFilter, setTypeFilter] = useState<ExamType | 'ALL'>('ALL')
  const [statusFilter, setStatusFilter] = useState<ExamStatus | 'ALL'>('ALL')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ExamWithScale | null>(null)
  const [resultExam, setResultExam] = useState<ExamWithScale | null>(null)

  const examsQuery = useExams({
    ...(typeFilter === 'ALL' ? {} : { type: typeFilter }),
    ...(statusFilter === 'ALL' ? {} : { status: statusFilter }),
  })
  const activeQuery = useActiveObjective()
  const deleteExam = useDeleteExam()

  if (examsQuery.isLoading || activeQuery.isLoading) {
    return <LoadingState label="Loading your exams..." />
  }

  if (examsQuery.isError) {
    return (
      <ErrorState
        title="Could not load your exams"
        message="The exams service did not respond."
        onRetry={() => void examsQuery.refetch()}
      />
    )
  }

  const exams = examsQuery.data?.data ?? []
  const today = activeQuery.data?.today ?? ''
  const objective = activeQuery.data?.objective ?? null
  const groups = groupExams(exams, today)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Exams &amp; mock tests</h2>
          <p className="text-muted-foreground mt-1">
            The exams you are preparing for, the target you set for each, and every result you have
            recorded.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null)
            setDialogOpen(true)
          }}
        >
          <Plus className="h-4 w-4" />
          Add exam
        </Button>
      </div>

      {objective && (
        <div className="border-border bg-muted/40 rounded-lg border p-3 text-sm">
          <p className="font-medium">
            Active objective: {objective.title}{' '}
            <span className="text-muted-foreground">({OBJECTIVE_TYPE_LABELS[objective.type]})</span>
          </p>
          <p className="text-muted-foreground mt-1">
            New exams are linked to this objective by default, so their results count as evidence for
            it.
          </p>
        </div>
      )}

      <div className="border-border bg-muted/40 text-muted-foreground flex items-start gap-2 rounded-lg border p-3 text-sm">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>
          Results are shown exactly as you record them, against the target you set. LingoPath does not
          predict a score and does not label you ready or not ready.
        </p>
      </div>

      <div className="border-border flex flex-wrap items-center gap-3 rounded-lg border p-4">
        <span className="text-muted-foreground text-sm font-medium">Filter:</span>
        <div className="flex flex-wrap gap-2">
          {(['ALL', 'IELTS', 'TOEFL', 'OTHER'] as const).map((option) => (
            <button
              key={option}
              onClick={() => setTypeFilter(option)}
              className={
                typeFilter === option
                  ? 'bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-sm font-medium transition-colors'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80 rounded-md px-3 py-1.5 text-sm font-medium transition-colors'
              }
            >
              {option === 'ALL' ? 'All types' : EXAM_TYPE_LABELS[option]}
            </button>
          ))}
        </div>
        <div className="border-border ml-auto flex items-center gap-2 border-l pl-3">
          <label htmlFor="exam-status-filter" className="text-muted-foreground text-sm">
            Status
          </label>
          <select
            id="exam-status-filter"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as ExamStatus | 'ALL')}
            className="border-input bg-background focus-visible:ring-ring h-9 rounded-md border px-3 text-sm focus-visible:outline-none focus-visible:ring-2"
          >
            {STATUS_FILTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {exams.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No exams yet"
          description="Add the IELTS or TOEFL exam you are preparing for, set a target band or score, and record mock results as you go."
          action={
            <Button
              onClick={() => {
                setEditing(null)
                setDialogOpen(true)
              }}
            >
              <Plus className="h-4 w-4" />
              Add exam
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-6">
          <section className="space-y-3">
            <h3 className="text-lg font-semibold">Ahead of you</h3>
            {groups.upcoming.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No exam is currently planned or registered.
              </p>
            ) : (
              <div className="flex flex-col gap-4">
                {groups.upcoming.map((exam) => (
                  <ExamCard
                    key={exam.id}
                    exam={exam}
                    isDeleting={deleteExam.isPending}
                    onEdit={(target) => {
                      setEditing(target)
                      setDialogOpen(true)
                    }}
                    onDelete={(id) => deleteExam.mutate(id)}
                    onRecordResult={setResultExam}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h3 className="text-lg font-semibold">History</h3>
            {groups.past.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Nothing recorded here yet — completed and cancelled exams appear in this section.
              </p>
            ) : (
              <div className="flex flex-col gap-4">
                {sortByExamDateDesc(groups.past).map((exam) => (
                  <ExamCard
                    key={exam.id}
                    exam={exam}
                    isDeleting={deleteExam.isPending}
                    onEdit={(target) => {
                      setEditing(target)
                      setDialogOpen(true)
                    }}
                    onDelete={(id) => deleteExam.mutate(id)}
                    onRecordResult={setResultExam}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Where these numbers come from</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground space-y-2 text-sm">
          <p>
            Every score on this page is a value you entered. The scale decides how it is read: an
            IELTS band is reported to the nearest half band out of 9, a TOEFL iBT total out of 120
            with sections out of 30.
          </p>
          <p>
            Study time is tracked separately, on the study pages, and is never converted into a
            level, a predicted score or a readiness judgement.
          </p>
        </CardContent>
      </Card>

      <ExamDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setEditing(null)
        }}
        exam={editing}
      />

      <RecordResultDialog
        open={resultExam !== null}
        onOpenChange={(open) => {
          if (!open) setResultExam(null)
        }}
        exam={resultExam}
      />
    </div>
  )
}
