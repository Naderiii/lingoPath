'use client'

import { Target } from 'lucide-react'
import { GoalCard } from './goal-card'
import type { GoalWithProgress } from '@/lib/hooks/use-goals'

interface GoalListProps {
  goals: GoalWithProgress[]
  isLoading?: boolean
  onGoalClick?: (goal: GoalWithProgress) => void
  onCreateClick?: () => void
}

export function GoalList({ goals, isLoading, onGoalClick, onCreateClick }: GoalListProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="border-border h-32 animate-pulse rounded-lg border bg-muted/50"
          />
        ))}
      </div>
    )
  }

  if (goals.length === 0) {
    return (
      <div className="border-border bg-muted/50 flex flex-col items-center justify-center rounded-lg border p-12 text-center">
        <Target className="text-muted-foreground mb-4 h-12 w-12" />
        <h3 className="text-foreground mb-2 text-lg font-semibold">No goals yet</h3>
        <p className="text-muted-foreground mb-4 max-w-sm">
          Create your first goal to start tracking your study progress. Set daily, weekly, monthly,
          or yearly targets.
        </p>
        {onCreateClick && (
          <button
            onClick={onCreateClick}
            className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-4 py-2 text-sm font-medium transition-colors"
          >
            Create Goal
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {goals.map((goal) => (
        <GoalCard key={goal.id} goal={goal} onClick={() => onGoalClick?.(goal)} />
      ))}
    </div>
  )
}
