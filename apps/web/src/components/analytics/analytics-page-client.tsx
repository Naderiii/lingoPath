'use client'

import { useMemo, useState } from 'react'
import { BarChart3 } from 'lucide-react'
import type { AnalyticsRangeKind } from '@lingopath/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/shared/empty-state'
import { ErrorState } from '@/components/shared/error-state'
import { LoadingState } from '@/components/shared/loading-state'
import { ComparisonPanel } from '@/components/analytics/comparison-panel'
import { PlanAnalytics } from '@/components/analytics/plan-analytics'
import { SkillBreakdown } from '@/components/analytics/skill-breakdown'
import { SummaryCards } from '@/components/analytics/summary-cards'
import { TrendChart } from '@/components/analytics/trend-chart'
import { useAnalytics } from '@/lib/hooks/use-analytics'
import { RANGE_OPTIONS, formatRangeLabel, validateRangeInputs } from '@/lib/analytics'
import { cn } from '@/lib/utils'

/**
 * `/analytics` — study-time analytics for a selectable window.
 *
 * Every number on the page comes from the single `/api/v1/analytics` payload for
 * one range, so the summary, the trend, the skill table and the comparison can
 * never describe different windows.
 */
export function AnalyticsPageClient() {
  const [range, setRange] = useState<AnalyticsRangeKind>('30d')
  const [draft, setDraft] = useState<{ from: string; to: string }>({ from: '', to: '' })
  const [applied, setApplied] = useState<{ from: string; to: string } | null>(null)
  const [rangeError, setRangeError] = useState<string | null>(null)

  const params = useMemo(
    () =>
      range === 'custom' && applied ? { range, from: applied.from, to: applied.to } : { range },
    [range, applied],
  )

  const { data, isLoading, isError, refetch } = useAnalytics(params)

  const applyCustomRange = () => {
    const message = validateRangeInputs(draft.from, draft.to)
    if (message) {
      setRangeError(message)
      return
    }
    setRangeError(null)
    setApplied({ from: draft.from, to: draft.to })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Analytics</h2>
          <p className="text-muted-foreground mt-1">
            {data
              ? `${formatRangeLabel(data.range.from, data.range.to)} · ${data.range.days} days · times in ${data.timezone}`
              : 'Study time, skills, trends and plan pacing'}
          </p>
        </div>
      </div>

      {/* Range selection */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {RANGE_OPTIONS.map((option) => (
            <Button
              key={option.value}
              variant={range === option.value ? 'default' : 'outline'}
              size="sm"
              aria-pressed={range === option.value}
              title={option.description}
              onClick={() => {
                setRange(option.value)
                setRangeError(null)
              }}
            >
              {option.label}
            </Button>
          ))}
        </div>

        {range === 'custom' && (
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="text-muted-foreground text-xs" htmlFor="analytics-from">
                From
              </label>
              <input
                id="analytics-from"
                type="date"
                value={draft.from}
                onChange={(event) => setDraft({ ...draft, from: event.target.value })}
                className="border-warm-border bg-surface focus-visible:ring-ring mt-1 block h-9 rounded-md border px-3 text-sm focus-visible:outline-none focus-visible:ring-2"
              />
            </div>
            <div>
              <label className="text-muted-foreground text-xs" htmlFor="analytics-to">
                To
              </label>
              <input
                id="analytics-to"
                type="date"
                value={draft.to}
                onChange={(event) => setDraft({ ...draft, to: event.target.value })}
                className="border-warm-border bg-surface focus-visible:ring-ring mt-1 block h-9 rounded-md border px-3 text-sm focus-visible:outline-none focus-visible:ring-2"
              />
            </div>
            <Button size="sm" onClick={applyCustomRange}>
              Apply
            </Button>
          </div>
        )}

        {rangeError && <p className="text-destructive text-sm">{rangeError}</p>}
        {range === 'custom' && !applied && !rangeError && (
          <p className="text-muted-foreground text-xs">
            Pick a start and end date, then apply the range.
          </p>
        )}
      </div>

      {isError ? (
        <Card>
          <CardContent className="p-0">
            <ErrorState
              title="Could not load analytics"
              message="The analytics request failed. Check that the API is running, then try again."
              onRetry={() => void refetch()}
            />
          </CardContent>
        </Card>
      ) : isLoading || !data ? (
        <Card>
          <CardContent className="p-0">
            <LoadingState label="Crunching your study data…" />
          </CardContent>
        </Card>
      ) : (
        <>
          <SummaryCards summary={data.summary} />

          {data.summary.totalSessions === 0 ? (
            <Card>
              <CardContent className="p-0">
                <EmptyState
                  icon={BarChart3}
                  title="No study recorded in this range"
                  description="Try a wider range, or log a session on the Study page — every metric here is derived from your sessions."
                />
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid gap-6 xl:grid-cols-2">
                <TrendChart points={data.trends.points} granularity={data.trends.granularity} />
                <ComparisonPanel
                  comparison={data.comparison}
                  previousRange={data.previousRange}
                  currentRange={data.range}
                />
              </div>

              <SkillBreakdown skills={data.skills} />

              {data.goals.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg font-semibold">Goal progress</CardTitle>
                    <p className="text-muted-foreground text-sm">
                      Active goals, measured over their current period (same rules as the Goals
                      page)
                    </p>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-3">
                      {data.goals.map((goal) => (
                        <li key={goal.id} className="space-y-1">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                            <span className="font-medium capitalize">
                              {goal.period.toLowerCase()} goal
                            </span>
                            <span className="text-muted-foreground tabular-nums">
                              {goal.actualMinutes}m / {goal.targetMinutes}m · {goal.percentage}%
                            </span>
                          </div>
                          <div className="bg-muted/40 h-2 w-full overflow-hidden rounded-full">
                            <div
                              className={cn(
                                'h-full rounded-full',
                                goal.status === 'completed' ? 'bg-green-500' : 'bg-primary',
                              )}
                              style={{ width: `${Math.max(0, Math.min(100, goal.percentage))}%` }}
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              <PlanAnalytics plans={data.plans} />
            </>
          )}
        </>
      )}
    </div>
  )
}
