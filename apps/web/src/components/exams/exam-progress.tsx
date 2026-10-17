'use client'

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { ExamWithScale } from '@lingopath/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/shared/empty-state'
import { dayKeyFromInstant, formatDayShortLabel } from '@/lib/calendar'
import { formatScore, sectionLabel } from '@/lib/exams'

interface ExamProgressProps {
  exam: ExamWithScale
}

/**
 * Every result recorded for one exam, in the order it was taken, with the target
 * drawn as a reference line.
 *
 * The line is a record of what was scored, not a forecast: nothing here projects a
 * future score or says whether the target will be met. The vertical axis is the
 * exam's own scale, so the same chart works for a 0–9 band and a 0–120 total.
 */
export function ExamProgress({ exam }: ExamProgressProps) {
  const results = [...(exam.results ?? [])].reverse() // the API sends newest first
  const scale = exam.scale

  if (results.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Recorded results</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            title="No results recorded yet"
            description="Record a mock or real result and it is charted here against the target you set."
          />
        </CardContent>
      </Card>
    )
  }

  const sectionKeys = Array.from(new Set(results.flatMap((result) => Object.keys(result.skillScores))))

  const points = results.map((result) => {
    const point: Record<string, string | number | null> = {
      label: formatDayShortLabel(dayKeyFromInstant(result.takenAt)),
      overall: result.overallScore,
    }
    for (const key of sectionKeys) {
      point[key] = result.skillScores[key] ?? null
    }
    return point
  })

  const latest = results[results.length - 1]
  const colors = ['hsl(var(--primary))', '#0ea5e9', '#6366f1', '#14b8a6', '#f59e0b']

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Recorded results</CardTitle>
        <p className="text-muted-foreground text-sm">
          {results.length} {results.length === 1 ? 'result' : 'results'} recorded
          {exam.targetScore !== null &&
            scale !== null &&
            ` · ${scale.targetLabel.toLowerCase()} ${formatScore(exam.targetScore, scale)}`}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          className="h-56 w-full"
          role="img"
          aria-label={`Recorded scores for ${exam.title} across ${results.length} results`}
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
                domain={[scale?.min ?? 0, scale?.max ?? 'auto']}
                tick={{ fontSize: 11 }}
                stroke="hsl(var(--muted-foreground))"
                width={44}
              />
              <Tooltip
                formatter={(value: unknown, name: unknown) => [
                  formatScore(Number(value), scale),
                  String(name) === 'overall'
                    ? 'Overall'
                    : sectionLabel(scale, String(name)),
                ]}
                contentStyle={{
                  background: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              {exam.targetScore !== null && (
                <ReferenceLine
                  y={exam.targetScore}
                  stroke="#f59e0b"
                  strokeDasharray="4 4"
                  label={{
                    value: scale ? `${scale.targetLabel} ${formatScore(exam.targetScore, scale)}` : 'Target',
                    position: 'insideTopRight',
                    fontSize: 11,
                    fill: 'hsl(var(--muted-foreground))',
                  }}
                />
              )}
              <Line
                type="monotone"
                dataKey="overall"
                name="overall"
                stroke={colors[0]}
                strokeWidth={2}
                connectNulls={false}
                dot={{ r: 3 }}
              />
              {sectionKeys.map((key, index) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  name={key}
                  stroke={colors[(index + 1) % colors.length]}
                  strokeWidth={1.5}
                  strokeDasharray="3 3"
                  connectNulls={false}
                  dot={{ r: 2 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div>
          <p className="text-sm font-medium">Most recent result</p>
          {latest && (
            <p className="text-muted-foreground text-sm">
              {formatDayShortLabel(dayKeyFromInstant(latest.takenAt))} ·{' '}
              {latest.isMock ? 'mock' : 'real'} exam · overall{' '}
              {formatScore(latest.overallScore, scale)}
            </p>
          )}
          {sectionKeys.length > 0 && (
            <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {sectionKeys.map((key) => (
                <div key={key} className="bg-muted/40 rounded-md px-3 py-2">
                  <dt className="text-muted-foreground text-xs">{sectionLabel(scale, key)}</dt>
                  <dd className="text-sm font-medium">
                    {formatScore(latest?.skillScores[key] ?? null, scale)}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
