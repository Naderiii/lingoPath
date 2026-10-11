'use client'

import { Trash2, Star, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ProgressBar } from './progress-bar'
import {
  formatMinutesDisplay,
  computeRemainingDaysClient,
  getPlanStatusDisplay,
  useDeleteMilestone,
  type MilestoneProgress,
} from '@/lib/hooks/use-plans'
import { Button } from '@/components/ui/button'

interface MilestoneListProps {
  milestones: MilestoneProgress[]
  planId: string
}

export function MilestoneList({ milestones, planId }: MilestoneListProps) {
  const deleteMilestone = useDeleteMilestone()

  if (milestones.length === 0) {
    return (
      <p className="text-muted-foreground py-4 text-center text-sm">
        No milestones yet. Add milestones to break your plan into achievable phases.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {milestones.map((ms) => {
        const remaining = computeRemainingDaysClient(ms.endDate)
        const statusDisplay = getPlanStatusDisplay(
          ms.status as 'ACTIVE' | 'COMPLETED' | 'ARCHIVED' | 'CANCELLED',
        )

        return (
          <div
            key={ms.milestoneId}
            className={cn(
              'rounded-lg border p-4',
              ms.isCurrent && 'border-primary/50 bg-primary/5',
              ms.isNext && 'border-blue-500/30 bg-blue-500/5',
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {ms.isCurrent && <Star className="text-primary h-4 w-4 shrink-0 fill-current" />}
                  {ms.isNext && <ArrowRight className="h-4 w-4 shrink-0 text-blue-500" />}
                  <h4 className="font-medium">{ms.title}</h4>
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                      statusDisplay.className,
                    )}
                  >
                    {statusDisplay.label}
                  </span>
                </div>
                {ms.description && (
                  <p className="text-muted-foreground mt-0.5 text-sm">{ms.description}</p>
                )}
                {ms.isCurrent && (
                  <p className="text-primary mt-0.5 text-xs font-medium">Current milestone</p>
                )}
                {ms.isNext && (
                  <p className="mt-0.5 text-xs font-medium text-blue-500">Next milestone</p>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-destructive h-8 w-8 shrink-0"
                onClick={() => void deleteMilestone.mutateAsync({ id: ms.milestoneId, planId })}
                disabled={deleteMilestone.isPending}
                aria-label="Delete milestone"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            <div className="text-muted-foreground mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
              <span>
                {new Date(ms.startDate).toLocaleDateString()} –{' '}
                {new Date(ms.endDate).toLocaleDateString()}
              </span>
              <span>{remaining} days left</span>
              <span>Target: {formatMinutesDisplay(ms.targetMinutes)}</span>
              <span>
                Done: {formatMinutesDisplay(ms.actualMinutes)} /{' '}
                {formatMinutesDisplay(ms.targetMinutes)}
              </span>
            </div>

            <div className="mt-2">
              <ProgressBar value={ms.progressPercent} size="sm" showPercent />
            </div>
          </div>
        )
      })}
    </div>
  )
}
