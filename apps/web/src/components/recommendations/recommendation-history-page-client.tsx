'use client'

/**
 * Every decision the learner has taken, newest first.
 *
 * A row is a decision, not a suggestion: the same recommendation can appear twice
 * if it was rejected on Monday and accepted on Wednesday, and the wording shown is
 * the stored wording from when the decision was made. That is what makes this page
 * a record rather than a re-render of the current advice.
 *
 * The page frame — title, filters, empty state — stays mounted while a new filter
 * loads, so changing the filter never makes the controls vanish under the pointer.
 */

import { useState } from 'react'
import Link from 'next/link'
import { History } from 'lucide-react'
import type { RecommendationAction } from '@lingopath/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/shared/empty-state'
import { ErrorState } from '@/components/shared/error-state'
import { LoadingState } from '@/components/shared/loading-state'
import { useRecommendationHistory } from '@/lib/hooks/use-recommendations'
import {
  actionLabel,
  formatDecisionDate,
  historyAppliedLabel,
  historyExcerpt,
} from '@/lib/recommendations'
import { cn } from '@/lib/utils'

const HISTORY_LIMIT = 30

const FILTERS: Array<{ label: string; action?: RecommendationAction }> = [
  { label: 'All' },
  { label: 'Accepted', action: 'ACCEPTED' },
  { label: 'Adjusted', action: 'MODIFIED' },
  { label: 'Rejected', action: 'REJECTED' },
  { label: 'Moved later', action: 'POSTPONED' },
]

export function RecommendationHistoryPageClient() {
  const [action, setAction] = useState<RecommendationAction | undefined>(undefined)
  const history = useRecommendationHistory(HISTORY_LIMIT, action)
  const entries = history.data?.data ?? []

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Suggestion history</h2>
          <p className="text-muted-foreground mt-1">
            What you did with each suggestion, with the wording it carried at the time.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/recommendations">Current suggestions</Link>
        </Button>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by action">
        {FILTERS.map((filter) => {
          const isActive = action === filter.action
          return (
            <Button
              key={filter.label}
              size="sm"
              variant={isActive ? 'default' : 'outline'}
              aria-pressed={isActive}
              onClick={() => setAction(filter.action)}
            >
              {filter.label}
            </Button>
          )
        })}
      </div>

      <Card>
        <CardContent className="p-0">
          {history.isLoading ? (
            <LoadingState label="Loading your decision history..." />
          ) : history.isError ? (
            <ErrorState
              title="Could not load your suggestion history"
              message="The recommendations service did not respond. Nothing was changed."
              onRetry={() => void history.refetch()}
            />
          ) : entries.length === 0 ? (
            <EmptyState
              icon={History}
              title={
                action === undefined ? 'No decisions recorded yet' : 'No decisions of this kind'
              }
              description={
                action === undefined
                  ? 'Accepting, adjusting, rejecting or postponing a suggestion records it here.'
                  : 'Try another filter, or look at all of your recorded decisions.'
              }
              action={
                action === undefined ? (
                  <Button variant="outline" asChild>
                    <Link href="/recommendations">See current suggestions</Link>
                  </Button>
                ) : (
                  <Button variant="outline" onClick={() => setAction(undefined)}>
                    Show all decisions
                  </Button>
                )
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="text-muted-foreground px-4 pt-4 text-left text-sm">
                  {entries.length} recorded {entries.length === 1 ? 'decision' : 'decisions'}
                  {history.data?.meta.count === HISTORY_LIMIT
                    ? ` · showing the most recent ${HISTORY_LIMIT}`
                    : ''}
                </caption>
                <thead>
                  <tr className="border-border border-b text-left">
                    <th scope="col" className="px-4 py-2 font-medium">
                      Suggestion
                    </th>
                    <th scope="col" className="px-4 py-2 font-medium">
                      Date
                    </th>
                    <th scope="col" className="px-4 py-2 font-medium">
                      Action
                    </th>
                    <th scope="col" className="px-4 py-2 font-medium">
                      Skill
                    </th>
                    <th scope="col" className="px-4 py-2 font-medium">
                      Rationale
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => {
                    const applied = historyAppliedLabel(entry)
                    return (
                      <tr key={entry.id} className="border-border/60 border-b align-top">
                        <td className="max-w-[22rem] px-4 py-3">
                          <p className="text-foreground font-medium">{entry.title}</p>
                          <p className="text-muted-foreground mt-1 text-xs">
                            {historyExcerpt(entry.recommendation, 140)}
                          </p>
                        </td>
                        <td className="text-muted-foreground whitespace-nowrap px-4 py-3">
                          {formatDecisionDate(entry.decidedAt)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                              entry.action === 'REJECTED'
                                ? 'bg-destructive/10 text-destructive'
                                : 'bg-accent text-accent-foreground',
                            )}
                          >
                            {actionLabel(entry.action)}
                          </span>
                          {applied !== null && (
                            <p className="text-muted-foreground mt-1 text-xs">{applied}</p>
                          )}
                          {entry.reason !== null && (
                            <p className="text-muted-foreground mt-1 max-w-[14rem] text-xs">
                              “{entry.reason}”
                            </p>
                          )}
                        </td>
                        <td className="text-muted-foreground whitespace-nowrap px-4 py-3">
                          {entry.relatedSkillName ?? '—'}
                        </td>
                        <td className="text-muted-foreground max-w-[20rem] px-4 py-3">
                          {historyExcerpt(entry.rationale, 220)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
