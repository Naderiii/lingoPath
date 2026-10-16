'use client'

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Target, TrendingUp } from 'lucide-react'
import type { AnalyticsPlan } from '@lingopath/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/shared/empty-state'
import {
  PACE_LABELS,
  describePace,
  formatMinutes,
  paceTone,
  toPlanMonthPoints,
  toPlanWeekPoints,
} from '@/lib/analytics'
import { cn } from '@/lib/utils'

interface PlanAnalyticsProps {
  plans: AnalyticsPlan[]
  className?: string
}

const CHART_STYLE = {
  background: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 8,
  fontSize: 12,
}

/**
 * Long-term plan analytics: planned vs actual, elapsed calendar time vs study
 * progress, milestone performance and the monthly/weekly breakdown — the numbers
 * a learner needs to answer "am I keeping up with my 6-month plan?".
 */
export function PlanAnalytics({ plans, className }: PlanAnalyticsProps) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Long-term plans</CardTitle>
        <p className="text-muted-foreground text-sm">
          Planned vs actual, pacing, milestones and the monthly/weekly breakdown for every active
          plan
        </p>
      </CardHeader>
      <CardContent className="space-y-8">
        {plans.length === 0 ? (
          <EmptyState
            icon={Target}
            title="No active long-term plans"
            description="Create a plan on the Planning page to track planned versus actual study time here."
          />
        ) : (
          plans.map((plan) => <PlanSection key={plan.planId} plan={plan} />)
        )}
      </CardContent>
    </Card>
  )
}

function PlanSection({ plan }: { plan: AnalyticsPlan }) {
  const tone = paceTone(plan.paceStatus)
  const monthPoints = toPlanMonthPoints(plan.monthly)
  const weekPoints = toPlanWeekPoints(plan.weekly)

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">{plan.title}</h3>
          <p className="text-muted-foreground text-xs">
            {plan.objectiveTitle ? `${plan.objectiveTitle} · ` : ''}
            {formatMinutes(plan.actualMinutes)} of {formatMinutes(plan.targetMinutes)} ·{' '}
            {plan.remainingDays} days left
          </p>
        </div>
        <span
          className={cn(
            'rounded-full px-3 py-1 text-xs font-medium',
            tone === 'positive' &&
              'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
            tone === 'negative' &&
              'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
            tone === 'neutral' && 'bg-accent-tint text-muted-foreground',
          )}
        >
          {PACE_LABELS[plan.paceStatus]}
        </span>
      </div>

      <p className="text-muted-foreground text-sm">{describePace(plan)}</p>

      {/* Planned vs actual and elapsed vs study progress */}
      <div className="grid gap-4 sm:grid-cols-2">
        <ProgressRow
          label="Planned vs actual"
          caption={`${formatMinutes(plan.actualMinutes)} of ${formatMinutes(plan.targetMinutes)}`}
          percent={plan.studyProgressPercent}
        />
        <ProgressRow
          label="Time elapsed vs study progress"
          caption={`${plan.elapsedDays} of ${plan.totalDays} days elapsed (${plan.timeProgressPercent}%)`}
          percent={plan.timeProgressPercent}
          secondaryPercent={plan.studyProgressPercent}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Remaining to target" value={formatMinutes(plan.remainingMinutes)} />
        <Stat label="Needed per day" value={`${formatMinutes(plan.requiredDailyMinutes)}/day`} />
        <Stat
          label="Unassigned time"
          value={formatMinutes(plan.unassignedMinutes)}
          hint="Logged on the plan but outside every milestone range"
        />
      </div>

      {/* Milestones */}
      {plan.milestones.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Milestone performance for {plan.title}</caption>
            <thead>
              <tr className="text-muted-foreground border-warm-border border-b text-left text-xs uppercase tracking-wide">
                <th scope="col" className="py-2 pr-3 font-medium">
                  Milestone
                </th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">
                  Actual
                </th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">
                  Target
                </th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">
                  Progress
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  State
                </th>
              </tr>
            </thead>
            <tbody>
              {plan.milestones.map((milestone) => (
                <tr
                  key={milestone.milestoneId}
                  className="border-warm-border/60 border-b last:border-0"
                >
                  <th scope="row" className="py-2 pr-3 text-left font-medium">
                    {milestone.title}
                  </th>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {formatMinutes(milestone.actualMinutes)}
                  </td>
                  <td className="text-muted-foreground py-2 pr-3 text-right tabular-nums">
                    {formatMinutes(milestone.targetMinutes)}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {milestone.progressPercent}%
                  </td>
                  <td className="text-muted-foreground py-2 text-right text-xs">
                    {milestone.isCurrent ? 'Current' : milestone.isNext ? 'Next' : milestone.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Monthly / weekly performance */}
      <div className="grid gap-4 lg:grid-cols-2">
        <PlanBarChart
          title="Monthly performance"
          caption={`${monthPoints.length} months with recorded study`}
          data={monthPoints}
          dataKey="label"
          emptyLabel="No study logged against this plan yet."
        />
        <PlanBarChart
          title="Weekly performance"
          caption={`${weekPoints.length} weeks with recorded study`}
          data={weekPoints}
          dataKey="label"
          emptyLabel="No study logged against this plan yet."
        />
      </div>
    </section>
  )
}

function PlanBarChart({
  title,
  caption,
  data,
  dataKey,
  emptyLabel,
}: {
  title: string
  caption: string
  data: Array<{ label: string; totalMinutes: number }>
  dataKey: string
  emptyLabel: string
}) {
  const hasValue = data.some((entry) => entry.totalMinutes > 0)

  return (
    <div>
      <p className="text-sm font-medium">{title}</p>
      <p className="text-muted-foreground text-xs">{caption}</p>
      {!hasValue ? (
        <p className="text-muted-foreground py-8 text-center text-xs">{emptyLabel}</p>
      ) : (
        <div className="mt-2 h-48 w-full" role="img" aria-label={`${title} chart`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey={dataKey}
                tick={{ fontSize: 11 }}
                stroke="hsl(var(--muted-foreground))"
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 11 }}
                stroke="hsl(var(--muted-foreground))"
                width={52}
                tickFormatter={(value: number) => formatMinutes(value)}
              />
              <Tooltip
                formatter={(value: unknown) => [formatMinutes(Number(value ?? 0)), 'Study time']}
                contentStyle={CHART_STYLE}
              />
              <Bar dataKey="totalMinutes" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

function ProgressRow({
  label,
  caption,
  percent,
  secondaryPercent,
}: {
  label: string
  caption: string
  percent: number
  secondaryPercent?: number
}) {
  const clamped = Math.max(0, Math.min(100, percent))

  return (
    <div className="border-warm-border rounded-lg border p-4">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums">{Math.round(percent * 10) / 10}%</span>
      </div>
      <div className="bg-muted/40 mt-2 h-2.5 w-full overflow-hidden rounded-full">
        <div className="bg-primary h-full rounded-full" style={{ width: `${clamped}%` }} />
      </div>
      {secondaryPercent !== undefined && (
        <div className="bg-muted/40 mt-1 h-1.5 w-full overflow-hidden rounded-full">
          <div
            className="h-full rounded-full bg-green-500"
            style={{ width: `${Math.max(0, Math.min(100, secondaryPercent))}%` }}
          />
        </div>
      )}
      <p className="text-muted-foreground mt-2 text-xs">{caption}</p>
      {secondaryPercent !== undefined && (
        <p className="text-muted-foreground mt-1 flex items-center gap-1 text-xs">
          <TrendingUp className="h-3 w-3" />
          Study progress {Math.round(secondaryPercent * 10) / 10}%
        </p>
      )}
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="border-warm-border rounded-lg border p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-muted-foreground mt-1 text-xs">{hint}</p>}
    </div>
  )
}
