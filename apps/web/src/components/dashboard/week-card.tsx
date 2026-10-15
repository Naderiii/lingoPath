'use client'

import { Calendar } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { DashboardData } from '@/lib/hooks/use-dashboard'

interface WeekCardProps {
  data: DashboardData['thisWeek']
}

export function WeekCard({ data }: WeekCardProps) {
  const progress = data.target > 0 ? (data.actual / data.target) * 100 : 0
  const maxDailyMinutes = Math.max(...data.dailyBreakdown.map((d) => d.minutes), 1)

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { weekday: 'short' })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl font-bold">This Week</CardTitle>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span>
              {data.actual} / {data.target} min
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Weekly Progress</span>
            <span className="font-medium">{Math.min(100, Math.round(progress))}%</span>
          </div>
          <div className="h-2 bg-accent-tint rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${Math.min(100, progress)}%` }}
            />
          </div>
        </div>

        {/* Daily breakdown */}
        <div className="space-y-2 pt-2">
          <p className="text-sm font-semibold text-muted-foreground">Daily Breakdown</p>
          <div className="flex items-end justify-between gap-2 h-32">
            {data.dailyBreakdown.map((day) => {
              const heightPercent = maxDailyMinutes > 0 ? (day.minutes / maxDailyMinutes) * 100 : 0
              const hasData = day.minutes > 0

              return (
                <div key={day.date} className="flex-1 flex flex-col items-center gap-2">
                  <div className="relative w-full flex-1 flex items-end">
                    <div
                      className={`w-full rounded-t transition-all duration-300 ${
                        hasData ? 'bg-primary' : 'bg-muted/30'
                      }`}
                      style={{ height: `${Math.max(4, heightPercent)}%` }}
                    />
                    {hasData && (
                      <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs font-medium whitespace-nowrap">
                        {day.minutes}m
                      </div>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground font-medium">
                    {formatDate(day.date)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="pt-2 border-t border-warm-border">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Target</span>
            <span className="font-semibold">{data.targetFormatted}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Actual</span>
            <span className="font-semibold text-primary">{data.actualFormatted}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
