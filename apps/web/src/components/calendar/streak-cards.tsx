'use client'

import { Flame, Info, Trophy } from 'lucide-react'
import type { StreakSummaryResponse } from '@lingopath/types'
import { Card, CardContent } from '@/components/ui/card'
import { formatDayShortLabel, formatMinutes } from '@/lib/calendar'
import { cn } from '@/lib/utils'

interface StreakCardsProps {
  streak: StreakSummaryResponse | undefined
  isLoading?: boolean
  className?: string
}

/**
 * Current streak, longest streak, and today's standing.
 *
 * The numbers come from the single canonical streak reader on the API — the same
 * one behind `/sessions/today-stats` — so the dashboard and this page can never
 * disagree about what counts as a day.
 */
export function StreakCards({ streak, isLoading = false, className }: StreakCardsProps) {
  if (isLoading || !streak) {
    return (
      <div className={cn('grid gap-4 sm:grid-cols-3', className)}>
        {Array.from({ length: 3 }).map((_, index) => (
          <Card key={index}>
            <CardContent className="animate-pulse space-y-3 p-5">
              <div className="bg-muted h-3 w-24 rounded" />
              <div className="bg-muted h-8 w-16 rounded" />
              <div className="bg-muted h-3 w-32 rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  const {
    currentStreak,
    longestStreak,
    currentStreakStart,
    currentStreakEnd,
    longestStreakStart,
    longestStreakEnd,
    todayMinutes,
    todayQualified,
    todayPending,
    qualifyingMinutes,
    minutesToQualifyToday,
    timezone,
  } = streak

  const currentRange =
    currentStreak > 0 && currentStreakStart && currentStreakEnd
      ? `${formatDayShortLabel(currentStreakStart)} – ${formatDayShortLabel(currentStreakEnd)}`
      : null

  const longestRange =
    longestStreak > 0 && longestStreakStart && longestStreakEnd
      ? `${formatDayShortLabel(longestStreakStart)} – ${formatDayShortLabel(longestStreakEnd)}`
      : null

  const todayHint = todayQualified
    ? 'Today counts toward your streak.'
    : todayPending
      ? `${formatMinutes(minutesToQualifyToday)} more today keeps the streak alive.`
      : `${formatMinutes(minutesToQualifyToday)} of study today starts a new streak.`

  return (
    <div className={cn('grid gap-4 sm:grid-cols-3', className)}>
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'rounded-md p-1.5',
                currentStreak > 0 ? 'bg-primary/15 text-primary' : 'bg-muted/40 text-muted',
              )}
            >
              <Flame className="h-4 w-4" />
            </span>
            <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
              Current streak
            </span>
          </div>
          <p className="mt-3 text-3xl font-bold tabular-nums">
            {currentStreak}
            <span className="text-muted-foreground ml-1 text-sm font-medium">
              {currentStreak === 1 ? 'day' : 'days'}
            </span>
          </p>
          <p className="text-muted-foreground mt-1 text-xs">{currentRange ?? todayHint}</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <div className="flex items-center gap-2">
            <span className="bg-accent-tint text-primary rounded-md p-1.5">
              <Trophy className="h-4 w-4" />
            </span>
            <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
              Longest streak
            </span>
          </div>
          <p className="mt-3 text-3xl font-bold tabular-nums">
            {longestStreak}
            <span className="text-muted-foreground ml-1 text-sm font-medium">
              {longestStreak === 1 ? 'day' : 'days'}
            </span>
          </p>
          <p className="text-muted-foreground mt-1 text-xs">{longestRange ?? 'No streak yet'}</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'rounded-md p-1.5',
                todayQualified
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
              )}
            >
              <Info className="h-4 w-4" />
            </span>
            <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
              Today
            </span>
          </div>
          <p className="mt-3 text-3xl font-bold tabular-nums">
            {formatMinutes(todayMinutes)}
            <span className="text-muted-foreground ml-1 text-sm font-medium">
              / {formatMinutes(qualifyingMinutes)}
            </span>
          </p>
          <p className="text-muted-foreground mt-1 text-xs">{todayHint}</p>
        </CardContent>
      </Card>

      <p className="text-muted-foreground text-xs sm:col-span-3">
        A day counts when you study at least {formatMinutes(qualifyingMinutes)}. Days are measured
        in {timezone}, so midnight, DST changes and month or year boundaries never break a streak.
      </p>
    </div>
  )
}
