'use client'

import { useState } from 'react'
import { Info, Plus } from 'lucide-react'
import type { LevelAssessmentEntry } from '@lingopath/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/shared/empty-state'
import { ErrorState } from '@/components/shared/error-state'
import { LoadingState } from '@/components/shared/loading-state'
import { AssessmentDialog } from './assessment-dialog'
import { AssessmentHistoryTable } from './assessment-history-table'
import { LevelHistoryChart } from './level-history-chart'
import { LevelSummaryCards } from './level-summary-cards'
import { ObjectiveFocusCard } from './objective-focus-card'
import { useDeleteAssessment, useLevelOverview } from '@/lib/hooks/use-levels'

const HISTORY_LIMIT = 50

/**
 * CEFR levels, over time.
 *
 * Everything on this page is a value the learner recorded: the current level of a
 * dimension, when it was recorded, how it changed, and the full history behind it.
 * The page states that provenance on screen, because the alternative — implying that
 * activity produced these numbers — would be a claim the data cannot support.
 */
export function LevelsPageClient() {
  const overview = useLevelOverview(HISTORY_LIMIT)
  const deleteAssessment = useDeleteAssessment()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<LevelAssessmentEntry | null>(null)

  if (overview.isLoading) return <LoadingState label="Loading your levels..." />

  if (overview.isError) {
    return (
      <ErrorState
        title="Could not load your levels"
        message="The assessments service did not respond."
        onRetry={() => void overview.refetch()}
      />
    )
  }

  const payload = overview.data
  if (!payload) return <LoadingState label="Loading your levels..." />

  const openCreate = () => {
    setEditing(null)
    setDialogOpen(true)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">CEFR levels</h2>
          <p className="text-muted-foreground mt-1">
            The A1–C2 levels you have recorded, per dimension, and how they changed over time.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Record assessment
        </Button>
      </div>

      <div className="border-border bg-muted/40 text-muted-foreground flex items-start gap-2 rounded-lg border p-3 text-sm">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>
          Levels here are the ones you record, and nothing else. LingoPath does not estimate a level
          from your study time and does not label you ready or not ready — decisions like that need
          evidence this app does not have.
        </p>
      </div>

      <ObjectiveFocusCard />

      <div className="space-y-3">
        <h3 className="text-lg font-semibold">Most recently recorded level</h3>
        <LevelSummaryCards dimensions={payload.dimensions} current={payload.current} />
      </div>

      <LevelHistoryChart
        history={payload.history}
        dimensions={payload.dimensions}
        rankByLevel={payload.rankByLevel}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Assessment history</CardTitle>
        </CardHeader>
        <CardContent>
          {payload.history.length === 0 ? (
            <EmptyState
              title="No assessments recorded yet"
              description="Record a placement test, a mock exam or your own self-assessment to start the history."
              action={
                <Button onClick={openCreate}>
                  <Plus className="h-4 w-4" />
                  Record assessment
                </Button>
              }
            />
          ) : (
            <AssessmentHistoryTable
              history={payload.history}
              dimensions={payload.dimensions}
              hasMore={payload.hasMore}
              total={payload.totalAssessments}
              isDeleting={deleteAssessment.isPending}
              onEdit={(assessment) => {
                setEditing(assessment)
                setDialogOpen(true)
              }}
              onDelete={(id) => deleteAssessment.mutate(id)}
            />
          )}
        </CardContent>
      </Card>

      <AssessmentDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setEditing(null)
        }}
        dimensions={payload.dimensions}
        rankByLevel={payload.rankByLevel}
        assessment={editing}
      />
    </div>
  )
}
