'use client'

import Link from 'next/link'
import { Calendar, Target, TrendingUp, Clock, ArrowRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { DashboardData } from '@/lib/hooks/use-dashboard'

interface ActivePlanCardProps {
  data: DashboardData['activePlan']
}

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function ActivePlanCard({ data }: ActivePlanCardProps) {
  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-bold">Active Long-Term Plan</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">
            No active plan.{' '}
            <Link href="/planning" className="text-primary hover:underline">
              Create one
            </Link>{' '}
            to track your long-term progress.
          </p>
        </CardContent>
      </Card>
    )
  }

  const timeProgressPercent =
    data.totalDays > 0 ? Math.min(100, Math.round((data.elapsedDays / data.totalDays) * 100)) : 0

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-2xl font-bold">{data.name}</CardTitle>
            {data.objective && (
              <p className="text-sm text-muted-foreground">{data.objective}</p>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm shrink-0">
            <Calendar className="h-4 w-4 text-primary" />
            <span className="font-semibold">{data.remainingDays} days remaining</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mt-1">
          <span>Start: {formatDate(data.startDate)}</span>
          <span>End: {formatDate(data.endDate)}</span>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Study progress (hours studied vs target) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">Study Progress</span>
            </div>
            <span className="text-sm font-bold">{data.studyProgress}%</span>
          </div>
          <div className="h-2.5 bg-muted/30 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${Math.min(100, data.studyProgress)}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Actual: <span className="font-medium text-foreground">{data.actual}</span>
            </span>
            <span>
              Target: <span className="font-medium text-foreground">{data.target}</span>
            </span>
          </div>
        </div>

        {/* Time elapsed progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">Time Elapsed</span>
            </div>
            <span className="text-sm font-medium text-muted-foreground">{timeProgressPercent}%</span>
          </div>
          <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden">
            <div
              className="h-full bg-muted-foreground/40 rounded-full transition-all duration-300"
              style={{ width: `${Math.min(100, timeProgressPercent)}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {data.elapsedDays} of {data.totalDays} days elapsed
          </p>
        </div>

        {/* Milestones */}
        {(data.currentMilestone ?? data.nextMilestone) && (
          <div className="space-y-2 pt-3 border-t border-border">
            {data.currentMilestone && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-primary uppercase tracking-wide">
                  Current Milestone
                </p>
                <div className="bg-primary/10 border border-primary/20 rounded-lg p-3">
                  <p className="font-semibold text-sm">{data.currentMilestone.title}</p>
                  {data.currentMilestone.description && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {data.currentMilestone.description}
                    </p>
                  )}
                </div>
              </div>
            )}
            {data.nextMilestone && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Next Milestone
                </p>
                <div className="bg-muted/20 border border-border rounded-lg p-3">
                  <p className="font-semibold text-sm">{data.nextMilestone.title}</p>
                  {data.nextMilestone.description && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {data.nextMilestone.description}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end pt-1">
          <Link
            href="/planning"
            className="flex items-center gap-1 text-sm text-primary hover:underline"
          >
            View full plan <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}
