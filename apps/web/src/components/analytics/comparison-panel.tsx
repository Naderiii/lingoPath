'use client'

import { Minus, TrendingDown, TrendingUp } from 'lucide-react'
import type { AnalyticsMetricDelta, AnalyticsPayload } from '@lingopath/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { describeDelta, formatMinutes, formatRangeLabel } from '@/lib/analytics'
import { cn } from '@/lib/utils'

interface ComparisonPanelProps {
  comparison: AnalyticsPayload['comparison']
  previousRange: AnalyticsPayload['previousRange']
  currentRange: AnalyticsPayload['range']
  className?: string
}

function DeltaRow({
  label,
  delta,
  format,
}: {
  label: string
  delta: AnalyticsMetricDelta
  format: (value: number) => string
}) {
  const Icon =
    delta.direction === 'up' ? TrendingUp : delta.direction === 'down' ? TrendingDown : Minus

  return (
    <tr className="border-warm-border/60 border-b last:border-0">
      <th scope="row" className="py-2 pr-3 text-left font-medium">
        {label}
      </th>
      <td className="py-2 pr-3 text-right tabular-nums">{format(delta.current)}</td>
      <td className="text-muted-foreground py-2 pr-3 text-right tabular-nums">
        {format(delta.previous)}
      </td>
      <td className="py-2 pr-3 text-right tabular-nums">
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
            delta.direction === 'up' &&
              'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
            delta.direction === 'down' &&
              'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
            delta.direction === 'flat' && 'bg-accent-tint text-muted-foreground',
          )}
        >
          <Icon className="h-3 w-3" />
          {describeDelta(delta)}
        </span>
      </td>
      <td
        className={cn(
          'py-2 text-right tabular-nums',
          delta.absolute > 0 && 'text-green-700 dark:text-green-400',
          delta.absolute < 0 && 'text-orange-700 dark:text-orange-400',
        )}
      >
        {delta.absolute > 0 ? '+' : ''}
        {format(delta.absolute)}
      </td>
    </tr>
  )
}

/**
 * Period-over-period comparison. A zero baseline is reported as "New" instead of
 * an infinite percentage (Phase 8 requirement), and the absolute change is always
 * shown so the comparison stays meaningful without a percentage.
 */
export function ComparisonPanel({
  comparison,
  previousRange,
  currentRange,
  className,
}: ComparisonPanelProps) {
  const basisLabel =
    currentRange.comparisonBasis === 'same-period-last-year'
      ? 'same period last year'
      : 'the preceding window of equal length'

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Current vs previous period</CardTitle>
        <p className="text-muted-foreground text-sm">
          {formatRangeLabel(currentRange.from, currentRange.to)} compared with{' '}
          {formatRangeLabel(previousRange.from, previousRange.to)} ({basisLabel})
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">
              Comparison of the current and previous period for study time, sessions, active days
              and average daily time
            </caption>
            <thead>
              <tr className="text-muted-foreground border-warm-border border-b text-left text-xs uppercase tracking-wide">
                <th scope="col" className="py-2 pr-3 font-medium">
                  Metric
                </th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">
                  Current
                </th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">
                  Previous
                </th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">
                  Change
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Absolute
                </th>
              </tr>
            </thead>
            <tbody>
              <DeltaRow
                label="Study time"
                delta={comparison.deltas.totalMinutes}
                format={formatMinutes}
              />
              <DeltaRow
                label="Sessions"
                delta={comparison.deltas.totalSessions}
                format={(value) => `${value}`}
              />
              <DeltaRow
                label="Active days"
                delta={comparison.deltas.activeDays}
                format={(value) => `${value}`}
              />
              <DeltaRow
                label="Average daily time"
                delta={comparison.deltas.averageDailyMinutes}
                format={formatMinutes}
              />
            </tbody>
          </table>
        </div>

        {comparison.deltas.totalMinutes.zeroBaseline &&
          comparison.deltas.totalMinutes.current > 0 && (
            <p className="text-muted-foreground mt-3 text-xs">
              The previous window had no recorded study time, so a percentage change would be
              meaningless — the absolute change is shown instead.
            </p>
          )}
      </CardContent>
    </Card>
  )
}
