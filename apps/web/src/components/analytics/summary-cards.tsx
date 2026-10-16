'use client'

import { CalendarDays, Clock, Flame, TrendingUp, Trophy } from 'lucide-react'
import type { AnalyticsSummary } from '@lingopath/types'
import { Card, CardContent } from '@/components/ui/card'
import { formatMinutes, targetCoveragePercent } from '@/lib/analytics'
import { cn } from '@/lib/utils'

interface SummaryCardsProps {
  summary: AnalyticsSummary
  className?: string
}

/**
 * The headline metrics of Phase 8: totals, day counts, averages, the longest
 * session, both streaks and how many days met the daily goal.
 */
export function SummaryCards({ summary, className }: SummaryCardsProps) {
  const cards = [
    {
      label: 'Total study time',
      value: summary.totalMinutesFormatted,
      hint: `${formatMinutes(summary.averageDailyMinutes)} average per day`,
      icon: Clock,
    },
    {
      label: 'Sessions',
      value: `${summary.totalSessions}`,
      hint: `${formatMinutes(summary.averageSessionMinutes)} average session`,
      icon: CalendarDays,
    },
    {
      label: 'Active days',
      value: `${summary.activeDays}`,
      hint: `${summary.inactiveDays} inactive of ${summary.daysInRange}`,
      icon: TrendingUp,
    },
    {
      label: 'Longest session',
      value: summary.longestSession ? summary.longestSession.minutesFormatted : '—',
      hint: summary.longestSession ? summary.longestSession.date : 'No sessions in range',
      icon: Trophy,
    },
    {
      label: 'Current streak',
      value: `${summary.currentStreak} ${summary.currentStreak === 1 ? 'day' : 'days'}`,
      hint: `Longest ${summary.longestStreak} ${summary.longestStreak === 1 ? 'day' : 'days'}`,
      icon: Flame,
    },
  ]

  const coverage = targetCoveragePercent(summary.percentageOfDaysMeetingTarget)

  return (
    <div className={cn('space-y-4', className)}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map((card) => (
          <Card key={card.label}>
            <CardContent className="p-5">
              <div className="flex items-center gap-2">
                <span className="bg-accent-tint text-primary rounded-md p-1.5">
                  <card.icon className="h-4 w-4" />
                </span>
                <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                  {card.label}
                </span>
              </div>
              <p className="mt-3 text-2xl font-bold tabular-nums">{card.value}</p>
              <p className="text-muted-foreground mt-1 text-xs">{card.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">Days meeting the daily goal</p>
              <p className="text-muted-foreground text-xs">
                Goal target {formatMinutes(summary.dailyTargetMinutes)} · streak day needs{' '}
                {formatMinutes(summary.qualifyingMinutes)}
              </p>
            </div>
            <p className="text-2xl font-bold tabular-nums">
              {summary.daysMeetingTarget}
              <span className="text-muted-foreground ml-1 text-sm font-medium">
                / {summary.daysInRange} days
              </span>
            </p>
          </div>
          <div
            className="bg-muted/40 mt-3 h-2.5 w-full overflow-hidden rounded-full"
            role="progressbar"
            aria-valuenow={coverage}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Percentage of days meeting the daily goal"
          >
            <div
              className="bg-primary h-full rounded-full transition-all"
              style={{ width: `${coverage}%` }}
            />
          </div>
          <p className="text-muted-foreground mt-2 text-xs">
            {summary.percentageOfDaysMeetingTarget}% of days in this range reached the goal.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
