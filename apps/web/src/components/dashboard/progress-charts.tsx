'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { DashboardData } from '@/lib/hooks/use-dashboard'

interface ProgressChartsProps {
  monthlyData: DashboardData['monthlyProgress']
  yearlyData: DashboardData['yearlyProgress']
}

export function ProgressCharts({ monthlyData, yearlyData }: ProgressChartsProps) {
  const maxMonthly = Math.max(...monthlyData.map((d) => d.totalMinutes), 1)
  const maxYearly = Math.max(...yearlyData.map((d) => d.totalMinutes), 1)

  const formatMonth = (monthStr: string) => {
    const [, month] = monthStr.split('-')
    const date = new Date(2000, parseInt(month!) - 1)
    return date.toLocaleString('en-US', { month: 'short' })
  }

  const formatDay = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.getDate().toString()
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Monthly Progress (Current Month Daily) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-bold">This Month</CardTitle>
          <p className="text-sm text-muted-foreground">Daily study time</p>
        </CardHeader>
        <CardContent>
          {monthlyData.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No study sessions this month.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-end justify-between gap-1 h-48">
                {monthlyData.map((day) => {
                  const heightPercent = maxMonthly > 0 ? (day.totalMinutes / maxMonthly) * 100 : 0
                  const hasData = day.totalMinutes > 0

                  return (
                    <div key={day.month} className="flex-1 flex flex-col items-center gap-2">
                      <div className="relative w-full flex-1 flex items-end">
                        <div
                          className={`w-full rounded-t transition-all duration-300 ${
                            hasData ? 'bg-primary' : 'bg-muted/30'
                          }`}
                          style={{ height: `${Math.max(4, heightPercent)}%` }}
                          title={`${formatDay(day.month)}: ${day.totalMinutes}m`}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatDay(day.month)}
                      </span>
                    </div>
                  )
                })}
              </div>
              <div className="flex items-center justify-between text-sm pt-2 border-t border-warm-border">
                <span className="text-muted-foreground">Total this month</span>
                <span className="font-semibold">
                  {Math.floor(
                    monthlyData.reduce((sum, d) => sum + d.totalMinutes, 0) / 60,
                  )}
                  h{' '}
                  {monthlyData.reduce((sum, d) => sum + d.totalMinutes, 0) % 60}m
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Yearly Progress (Monthly) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-bold">This Year</CardTitle>
          <p className="text-sm text-muted-foreground">Monthly breakdown</p>
        </CardHeader>
        <CardContent>
          {yearlyData.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No study sessions this year.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-end justify-between gap-2 h-48">
                {yearlyData.map((month) => {
                  const heightPercent = maxYearly > 0 ? (month.totalMinutes / maxYearly) * 100 : 0
                  const hasData = month.totalMinutes > 0

                  return (
                    <div key={month.month} className="flex-1 flex flex-col items-center gap-2">
                      <div className="relative w-full flex-1 flex items-end">
                        <div
                          className={`w-full rounded-t transition-all duration-300 ${
                            hasData ? 'bg-primary' : 'bg-muted/30'
                          }`}
                          style={{ height: `${Math.max(4, heightPercent)}%` }}
                          title={`${formatMonth(month.month)}: ${month.totalMinutes}m`}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatMonth(month.month)}
                      </span>
                    </div>
                  )
                })}
              </div>
              <div className="flex items-center justify-between text-sm pt-2 border-t border-warm-border">
                <span className="text-muted-foreground">Total this year</span>
                <span className="font-semibold">
                  {Math.floor(yearlyData.reduce((sum, d) => sum + d.totalMinutes, 0) / 60)}h{' '}
                  {yearlyData.reduce((sum, d) => sum + d.totalMinutes, 0) % 60}m
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
