'use client'

import { Clock, Target, Flame, TrendingUp } from 'lucide-react'
import { useTodayStats, formatDuration } from '@/lib/hooks/use-sessions'
import { cn } from '@/lib/utils'

export function TodayStats() {
  const { data, isLoading } = useTodayStats()

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="animate-pulse rounded-lg border p-4">
            <div className="bg-muted h-4 w-20 rounded" />
            <div className="bg-muted mt-2 h-8 w-16 rounded" />
          </div>
        ))}
      </div>
    )
  }

  const todayMinutes = data?.todayTotalMinutes ?? 0
  const targetMinutes = data?.dailyTargetMinutes ?? 60
  const remainingMinutes = data?.remainingMinutes ?? 60
  const streak = data?.streak ?? 0
  const progressPercent = Math.min(100, Math.round((todayMinutes / targetMinutes) * 100))

  const stats = [
    {
      label: "Today's Study Time",
      value: formatDuration(todayMinutes),
      icon: Clock,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    },
    {
      label: 'Daily Target',
      value: formatDuration(targetMinutes),
      icon: Target,
      color: 'text-purple-600 dark:text-purple-400',
      bgColor: 'bg-purple-50 dark:bg-purple-900/20',
    },
    {
      label: 'Remaining',
      value: remainingMinutes > 0 ? formatDuration(remainingMinutes) : 'Done!',
      icon: TrendingUp,
      color:
        remainingMinutes > 0
          ? 'text-orange-600 dark:text-orange-400'
          : 'text-green-600 dark:text-green-400',
      bgColor:
        remainingMinutes > 0
          ? 'bg-orange-50 dark:bg-orange-900/20'
          : 'bg-green-50 dark:bg-green-900/20',
    },
    {
      label: 'Current Streak',
      value: `${streak} day${streak !== 1 ? 's' : ''}`,
      icon: Flame,
      color: streak > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-400',
      bgColor: streak > 0 ? 'bg-red-50 dark:bg-red-900/20' : 'bg-gray-50 dark:bg-gray-900/20',
    },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-lg border p-4">
            <div className="flex items-center gap-2">
              <div className={cn('rounded-md p-1.5', stat.bgColor)}>
                <stat.icon className={cn('h-4 w-4', stat.color)} />
              </div>
              <span className="text-muted-foreground text-xs font-medium">{stat.label}</span>
            </div>
            <p className="mt-2 text-2xl font-bold">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div className="rounded-lg border p-4">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Daily Progress</span>
          <span className="font-medium">{progressPercent}%</span>
        </div>
        <div className="bg-secondary h-3 w-full overflow-hidden rounded-full">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              progressPercent >= 100
                ? 'bg-green-500'
                : progressPercent >= 75
                  ? 'bg-blue-500'
                  : progressPercent >= 50
                    ? 'bg-yellow-500'
                    : 'bg-orange-500',
            )}
            style={{ width: `${Math.min(100, progressPercent)}%` }}
          />
        </div>
      </div>
    </div>
  )
}
