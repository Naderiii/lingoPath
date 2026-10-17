'use client'

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { CefrLevel, LevelAssessmentEntry, LevelDimension } from '@lingopath/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/shared/empty-state'
import { dayKeyFromInstant, formatDayShortLabel } from '@/lib/calendar'
import { dimensionLabel, levelsByRank } from '@/lib/levels'

interface LevelHistoryChartProps {
  history: LevelAssessmentEntry[]
  dimensions: LevelDimension[]
  rankByLevel: Record<CefrLevel, number>
  className?: string
}

/** Distinct colours per dimension line; the level scale itself is not colour-coded. */
const LINE_COLORS = ['hsl(var(--primary))', '#0ea5e9', '#6366f1', '#14b8a6', '#f59e0b']

interface Point {
  label: string
  [dimension: string]: string | number | null
}

/**
 * Recorded levels over time.
 *
 * One point per assessment, plotted on the rank the API assigned to each level, so
 * the vertical axis is the CEFR order itself and the chart cannot reorder the scale.
 * A dimension that was not assessed on a given date has a gap rather than an
 * interpolated value.
 */
export function LevelHistoryChart({
  history,
  dimensions,
  rankByLevel,
  className,
}: LevelHistoryChartProps) {
  const ordered = [...history].reverse() // the API sends newest first
  const levels = levelsByRank(rankByLevel)

  const points: Point[] = ordered.map((assessment) => {
    const point: Point = { label: formatDayShortLabel(dayKeyFromInstant(assessment.assessedAt)) }
    for (const dimension of dimensions) {
      const level = assessment.levels[dimension]
      point[dimension] = level === null ? null : rankByLevel[level]
    }
    return point
  })

  const plotted = dimensions.filter((dimension) =>
    points.some((point) => typeof point[dimension] === 'number'),
  )

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Level history</CardTitle>
        <p className="text-muted-foreground text-sm">
          {points.length} recorded {points.length === 1 ? 'assessment' : 'assessments'} · a gap means
          that dimension was not assessed
        </p>
      </CardHeader>
      <CardContent>
        {points.length === 0 ? (
          <EmptyState
            title="No assessments recorded"
            description="Record an assessment and your levels appear here over time."
          />
        ) : (
          <div
            className="h-72 w-full"
            role="img"
            aria-label={`CEFR level history with ${points.length} recorded assessments`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={points} margin={{ top: 8, right: 16, bottom: 0, left: -18 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11 }}
                  stroke="hsl(var(--muted-foreground))"
                  interval="preserveStartEnd"
                  minTickGap={12}
                />
                <YAxis
                  domain={[0.5, 6.5]}
                  ticks={[1, 2, 3, 4, 5, 6]}
                  tick={{ fontSize: 11 }}
                  stroke="hsl(var(--muted-foreground))"
                  width={40}
                  tickFormatter={(value: number) => levels[value - 1] ?? String(value)}
                />
                <Tooltip
                  formatter={(value: unknown, name: unknown) => {
                    const rank = Number(value)
                    return [levels[rank - 1] ?? String(value), dimensionLabel(String(name))]
                  }}
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend formatter={(value: string) => dimensionLabel(value)} />
                {plotted.map((dimension, index) => (
                  <Line
                    key={dimension}
                    type="monotone"
                    dataKey={dimension}
                    connectNulls={false}
                    stroke={LINE_COLORS[index % LINE_COLORS.length]}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
