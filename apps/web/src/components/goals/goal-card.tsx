'use client'

import { Calendar, Target, TrendingUp, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ProgressBar } from '../planning/progress-bar'
import {
  formatMinutesDisplay,
  getGoalPeriodLabel,
  getGoalStatusDisplay,
  type GoalWithProgress,
} from '@/lib/hooks/use-goals'

interface GoalCardProps {
  goal: GoalWithProgress
  onClick?: () => void
}

export function GoalCard({ goal, onClick }: GoalCardProps) {
  const statusDisplay = getGoalStatusDisplay(goal.progress.status)
  const periodLabel = getGoalPeriodLabel(goal.period)
  const startDate = new Date(goal.startDate)
  const endDate = goal.endDate ? new Date(goal.endDate) : null

  // Visual progress capped at 100%, but actual values shown accurately
  const visualProgress = Math.min(100, goal.progress.percentage)
  const isOverTarget = goal.progress.actualMinutes > goal.progress.targetMinutes

  return (
    <button
      onClick={onClick}
      className="border-border hover:border-primary/30 hover:bg-accent/50 block w-full rounded-lg border p-4 text-left transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-foreground truncate font-semibold">{periodLabel} Goal</h3>
            {goal.progress.status === 'completed' && (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
            )}
          </div>
          <p className="text-muted-foreground mt-0.5 text-sm">
            {startDate.toLocaleDateString()}
            {endDate && ` – ${endDate.toLocaleDateString()}`}
          </p>
          {goal.plan && (
            <p className="text-muted-foreground mt-0.5 text-xs">Plan: {goal.plan.title}</p>
          )}
          {goal.topic && (
            <p className="text-muted-foreground mt-0.5 text-xs">Focus: {goal.topic}</p>
          )}
        </div>
        <span
          className={cn(
            'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium',
            statusDisplay.className,
          )}
        >
          {statusDisplay.label}
        </span>
      </div>

      <div className="mt-3 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <div className="text-muted-foreground flex items-center gap-1.5">
            <Target className="h-3.5 w-3.5 shrink-0" />
            <span>Target: {formatMinutesDisplay(goal.progress.targetMinutes)}</span>
          </div>
          <div className="text-muted-foreground flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5 shrink-0" />
            <span className={cn(isOverTarget && 'font-semibold text-green-600')}>
              {formatMinutesDisplay(goal.progress.actualMinutes)}
            </span>
          </div>
        </div>

        {goal.progress.remainingMinutes > 0 && (
          <div className="text-muted-foreground flex items-center gap-1.5 text-sm">
            <Calendar className="h-3.5 w-3.5 shrink-0" />
            <span>Remaining: {formatMinutesDisplay(goal.progress.remainingMinutes)}</span>
          </div>
        )}
      </div>

      <div className="mt-3">
        <ProgressBar value={visualProgress} size="sm" />
        {isOverTarget && (
          <p className="text-muted-foreground mt-1 text-xs">
            {formatMinutesDisplay(goal.progress.actualMinutes)} /{' '}
            {formatMinutesDisplay(goal.progress.targetMinutes)}
          </p>
        )}
      </div>

      {goal.skillTargets && goal.skillTargets.length > 0 && (
        <div className="mt-3 border-t border-border pt-3">
          <p className="text-muted-foreground mb-2 text-xs font-medium">Skill Distribution</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {goal.skillTargets.slice(0, 4).map((target) => {
              const skillProgress = goal.progress.skillProgress.find(
                (sp) => sp.skill.id === target.skillId,
              )
              return (
                <div key={target.skillId} className="text-muted-foreground">
                  <span className="font-medium">{target.skill.name}:</span>{' '}
                  <span>
                    {skillProgress
                      ? formatMinutesDisplay(skillProgress.actualMinutes)
                      : '0m'}
                    {' / '}
                    {formatMinutesDisplay(target.targetMinutes)}
                  </span>
                </div>
              )
            })}
            {goal.skillTargets.length > 4 && (
              <div className="text-muted-foreground col-span-2 text-xs">
                +{goal.skillTargets.length - 4} more skills
              </div>
            )}
          </div>
        </div>
      )}
    </button>
  )
}
