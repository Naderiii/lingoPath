'use client'

import { X, Calendar, Target, TrendingUp, CheckCircle2, Edit, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ProgressBar } from '../planning/progress-bar'
import {
  formatMinutesDisplay,
  getGoalPeriodLabel,
  getGoalStatusDisplay,
  useDeleteGoal,
  type GoalWithProgress,
} from '@/lib/hooks/use-goals'
import { cn } from '@/lib/utils'

interface GoalDetailDialogProps {
  goal: GoalWithProgress
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function GoalDetailDialog({ goal, open, onOpenChange }: GoalDetailDialogProps) {
  const deleteGoal = useDeleteGoal()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const statusDisplay = getGoalStatusDisplay(goal.progress.status)
  const periodLabel = getGoalPeriodLabel(goal.period)
  const startDate = new Date(goal.startDate)
  const endDate = goal.endDate ? new Date(goal.endDate) : null

  const visualProgress = Math.min(100, goal.progress.percentage)
  const isOverTarget = goal.progress.actualMinutes > goal.progress.targetMinutes

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }

    try {
      await deleteGoal.mutateAsync(goal.id)
      onOpenChange(false)
    } catch (error) {
      console.error('Failed to delete goal:', error)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <div className="bg-background fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="bg-background/80 fixed inset-0 backdrop-blur-sm"
          onClick={() => onOpenChange(false)}
        />
        <div className="bg-background border-border relative z-10 w-full max-w-2xl rounded-lg border shadow-lg">
          {/* Header */}
          <div className="border-border flex items-center justify-between border-b px-6 py-4">
            <div className="flex items-center gap-3">
              <h2 className="text-foreground text-xl font-semibold">{periodLabel} Goal</h2>
              {goal.progress.status === 'completed' && (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              )}
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                  statusDisplay.className,
                )}
              >
                {statusDisplay.label}
              </span>
            </div>
            <button
              onClick={() => onOpenChange(false)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Content */}
          <div className="max-h-[calc(100vh-12rem)] overflow-y-auto p-6">
            <div className="space-y-6">
              {/* Dates */}
              <div className="border-border rounded-lg border p-4">
                <div className="text-muted-foreground mb-2 flex items-center gap-2 text-sm font-medium">
                  <Calendar className="h-4 w-4" />
                  Period
                </div>
                <p className="text-foreground">
                  {startDate.toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                  {endDate &&
                    ` – ${endDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`}
                </p>
                {goal.topic && (
                  <p className="text-muted-foreground mt-2 text-sm">Focus: {goal.topic}</p>
                )}
              </div>

              {/* Progress Overview */}
              <div className="border-border rounded-lg border p-4">
                <h3 className="text-foreground mb-4 font-semibold">Progress</h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <div className="text-muted-foreground mb-1 text-xs font-medium">Target</div>
                      <div className="text-foreground flex items-center justify-center gap-1 text-lg font-semibold">
                        <Target className="h-4 w-4" />
                        {formatMinutesDisplay(goal.progress.targetMinutes)}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground mb-1 text-xs font-medium">Actual</div>
                      <div
                        className={cn(
                          'flex items-center justify-center gap-1 text-lg font-semibold',
                          isOverTarget ? 'text-green-600' : 'text-foreground',
                        )}
                      >
                        <TrendingUp className="h-4 w-4" />
                        {formatMinutesDisplay(goal.progress.actualMinutes)}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground mb-1 text-xs font-medium">Remaining</div>
                      <div className="text-foreground text-lg font-semibold">
                        {formatMinutesDisplay(goal.progress.remainingMinutes)}
                      </div>
                    </div>
                  </div>

                  <ProgressBar value={visualProgress} size="lg" />

                  {isOverTarget && (
                    <div className="bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-400 rounded-md p-3 text-sm">
                      Congratulations! You&apos;ve exceeded your target by{' '}
                      {formatMinutesDisplay(
                        goal.progress.actualMinutes - goal.progress.targetMinutes,
                      )}
                      .
                    </div>
                  )}
                </div>
              </div>

              {/* Skill Distribution */}
              {goal.skillTargets && goal.skillTargets.length > 0 && (
                <div className="border-border rounded-lg border p-4">
                  <h3 className="text-foreground mb-4 font-semibold">Skill Distribution</h3>
                  <div className="space-y-3">
                    {goal.skillTargets.map((target) => {
                      const skillProgress = goal.progress.skillProgress.find(
                        (sp) => sp.skill.id === target.skillId,
                      )
                      const actualMinutes = skillProgress?.actualMinutes ?? 0
                      const percentage =
                        target.targetMinutes > 0
                          ? Math.min(100, Math.round((actualMinutes / target.targetMinutes) * 100))
                          : 0

                      return (
                        <div key={target.skillId}>
                          <div className="mb-1 flex items-center justify-between text-sm">
                            <span className="text-foreground font-medium">{target.skill.name}</span>
                            <span className="text-muted-foreground">
                              {formatMinutesDisplay(actualMinutes)} /{' '}
                              {formatMinutesDisplay(target.targetMinutes)}
                            </span>
                          </div>
                          <ProgressBar value={percentage} size="sm" showPercent={false} />
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Linked Plan */}
              {goal.plan && (
                <div className="border-border rounded-lg border p-4">
                  <div className="text-muted-foreground mb-2 text-sm font-medium">Linked Plan</div>
                  <p className="text-foreground">{goal.plan.title}</p>
                </div>
              )}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="border-border flex justify-between border-t px-6 py-4">
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteGoal.isPending}
            >
              <Trash2 className="h-4 w-4" />
              {confirmDelete ? 'Confirm Delete' : 'Delete Goal'}
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  )
}
