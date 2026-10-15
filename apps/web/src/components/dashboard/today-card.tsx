'use client'

import Link from 'next/link'
import { Clock, Target, TrendingUp, Flame, Plus } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { DashboardData } from '@/lib/hooks/use-dashboard'

interface TodayCardProps {
  data: DashboardData['today']
}

export function TodayCard({ data }: TodayCardProps) {
  const progress = data.dailyTarget > 0 ? (data.studyTime / data.dailyTarget) * 100 : 0
  const isComplete = progress >= 100

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl font-bold">Today</CardTitle>
          <Link href="/study">
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" />
              Log Session
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Clock className="h-4 w-4" />
              <span>Study Time</span>
            </div>
            <p className="text-2xl font-bold text-primary">{data.studyTimeFormatted}</p>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Target className="h-4 w-4" />
              <span>Daily Target</span>
            </div>
            <div>
              <p className="text-2xl font-bold">{data.dailyTargetFormatted}</p>
              {!data.hasDailyGoal && (
                <p className="text-xs text-muted-foreground mt-0.5">default — no goal set</p>
              )}
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Progress toward daily target</span>
            <span className="font-medium">{Math.min(100, Math.round(progress))}%</span>
          </div>
          <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 rounded-full ${isComplete ? 'bg-green-500' : 'bg-primary'}`}
              style={{ width: `${Math.min(100, progress)}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <TrendingUp className="h-4 w-4" />
              <span>Remaining</span>
            </div>
            <p className="text-lg font-semibold">
              {isComplete ? (
                <span className="text-green-600">Target met!</span>
              ) : (
                data.remainingTargetFormatted
              )}
            </p>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Flame className="h-4 w-4" />
              <span>Streak</span>
            </div>
            <p className="text-lg font-semibold">
              {data.currentStreak > 0 ? (
                <span>{data.currentStreak} {data.currentStreak === 1 ? 'day' : 'days'}</span>
              ) : (
                <span className="text-muted-foreground">No streak yet</span>
              )}
            </p>
          </div>
        </div>

        <div className="text-sm text-muted-foreground">
          {data.sessions === 0 ? (
            <span>No sessions today — <Link href="/study" className="text-primary hover:underline">log your first</Link></span>
          ) : (
            <span>{data.sessions} {data.sessions === 1 ? 'session' : 'sessions'} today</span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
