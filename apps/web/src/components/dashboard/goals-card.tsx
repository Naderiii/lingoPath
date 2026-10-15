'use client'

import Link from 'next/link'
import { Target, ArrowRight, CheckCircle2, Clock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { DashboardData } from '@/lib/hooks/use-dashboard'

interface GoalsCardProps {
  goals: DashboardData['activeGoals']
}

export function GoalsCard({ goals }: GoalsCardProps) {
  if (goals.length === 0) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl font-bold">Active Goals</CardTitle>
            <Link href="/goals" className="text-sm text-primary hover:underline">
              Manage goals
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-6">
            No active goals set.{' '}
            <Link href="/goals" className="text-primary hover:underline">
              Create a goal
            </Link>{' '}
            to track your daily or weekly targets.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl font-bold">Active Goals</CardTitle>
          <Link
            href="/goals"
            className="flex items-center gap-1 text-sm text-primary hover:underline"
          >
            View all <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {goals.map((goal) => {
            const isCompleted = goal.status === 'completed'

            return (
              <div
                key={goal.id}
                className="bg-surface border border-warm-border rounded-lg p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {goal.period} GOAL
                  </span>
                  {isCompleted ? (
                    <span className="flex items-center gap-1 text-xs font-medium text-green-600 bg-green-500/10 px-2 py-0.5 rounded-full">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Completed
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                      <Clock className="h-3.5 w-3.5" /> In Progress
                    </span>
                  )}
                </div>

                <div className="space-y-1">
                  <div className="flex items-baseline justify-between">
                    <span className="text-2xl font-bold text-foreground">
                      {goal.actualFormatted}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      Target: {goal.targetFormatted}
                    </span>
                  </div>
                  <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        isCompleted ? 'bg-green-500' : 'bg-primary'
                      }`}
                      style={{ width: `${Math.min(100, goal.percentage)}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-warm-border">
                  <span>{goal.percentage}% achieved</span>
                  <span>
                    {isCompleted ? 'Goal achieved!' : `${goal.remainingFormatted} remaining`}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
