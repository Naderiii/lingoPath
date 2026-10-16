'use client'

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { AnalyticsTrendGranularity, AnalyticsTrendPoint } from '@lingopath/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/shared/empty-state'
import { chartDomainMax, formatMinutes, toChartPoints } from '@/lib/analytics'
import { cn } from '@/lib/utils'

interface TrendChartProps {
  points: AnalyticsTrendPoint[]
  granularity: AnalyticsTrendGranularity
  className?: string
}

const GRANULARITY_LABEL: Record<AnalyticsTrendGranularity, string> = {
  day: 'Daily study time',
  week: 'Weekly study time',
  month: 'Monthly study time',
}

/**
 * Study-time trend. Uses the series the API already aggregated (day / week /
 * month buckets chosen from the range length), so the chart never re-derives
 * totals from a different window.
 */
export function TrendChart({ points, granularity, className }: TrendChartProps) {
  const data = toChartPoints(points, granularity)
  const hasActivity = data.some((point) => point.minutes > 0)

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">{GRANULARITY_LABEL[granularity]}</CardTitle>
        <p className="text-muted-foreground text-sm">
          {data.length}{' '}
          {granularity === 'day' ? 'days' : granularity === 'week' ? 'weeks' : 'months'} in this
          range
        </p>
      </CardHeader>
      <CardContent>
        {!hasActivity ? (
          <EmptyState
            title="No study time in this range"
            description="Log a session and the trend will fill in here."
          />
        ) : (
          <div
            className="h-64 w-full"
            role="img"
            aria-label={`${GRANULARITY_LABEL[granularity]} chart with ${data.length} points`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                <defs>
                  <linearGradient id="analytics-trend" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11 }}
                  stroke="hsl(var(--muted-foreground))"
                  interval="preserveStartEnd"
                  minTickGap={16}
                />
                <YAxis
                  domain={[0, chartDomainMax(data)]}
                  tick={{ fontSize: 11 }}
                  stroke="hsl(var(--muted-foreground))"
                  width={48}
                  tickFormatter={(value: number) => formatMinutes(value)}
                />
                <Tooltip
                  formatter={(value: unknown, name: unknown) => [
                    formatMinutes(Number(value ?? 0)),
                    String(name) === 'minutes' ? 'Study time' : 'Sessions',
                  ]}
                  labelFormatter={(_label: unknown, payload: unknown) => {
                    const first = (
                      payload as Array<{ payload?: { label?: string } }> | undefined
                    )?.[0]
                    return first?.payload?.label ?? ''
                  }}
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="minutes"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  fill="url(#analytics-trend)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

interface SkillBarChartProps {
  skills: Array<{ skillId: string; name: string; totalMinutes: number }>
  className?: string
}

/** Horizontal comparison of study time per skill. */
export function SkillBarChart({ skills, className }: SkillBarChartProps) {
  const data = skills.slice(0, 8).map((skill) => ({
    name: skill.name,
    minutes: skill.totalMinutes,
  }))

  if (data.length === 0) return null

  return (
    <div className={cn('h-64 w-full', className)} role="img" aria-label="Study minutes by skill">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fontSize: 11 }}
            stroke="hsl(var(--muted-foreground))"
            tickFormatter={(value: number) => formatMinutes(value)}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={96}
            tick={{ fontSize: 11 }}
            stroke="hsl(var(--muted-foreground))"
          />
          <Tooltip
            formatter={(value: unknown) => [formatMinutes(Number(value ?? 0)), 'Study time']}
            contentStyle={{
              background: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Bar dataKey="minutes" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
