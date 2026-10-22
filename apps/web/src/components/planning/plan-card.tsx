'use client'

import Link from 'next/link'
import { Calendar, Clock, Target, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ProgressBar } from './progress-bar'
import {
  formatMinutesDisplay,
  computeRemainingDaysClient,
  getPlanStatusDisplay,
  type PlanListItem,
} from '@/lib/hooks/use-plans'

interface PlanCardProps {
  plan: PlanListItem
}

export function PlanCard({ plan }: PlanCardProps) {
  const remainingDays = plan.remainingDays ?? computeRemainingDaysClient(plan.endDate)
  const statusDisplay = getPlanStatusDisplay(plan.status)
  const startDate = new Date(plan.startDate)
  const endDate = new Date(plan.endDate)

  return (
    <Link
      href={`/planning/${plan.id}`}
      className="border-border hover:border-primary/30 hover:bg-accent/50 block rounded-lg border p-4 transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-foreground truncate font-semibold">{plan.title}</h3>
          {plan.description && (
            <p className="text-muted-foreground mt-0.5 line-clamp-1 text-sm">{plan.description}</p>
          )}
          {plan.objective && (
            <p className="text-muted-foreground mt-0.5 text-xs">
              Objective: {plan.objective.title}
            </p>
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

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
        <div className="text-muted-foreground flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">
            {startDate.toLocaleDateString()} – {endDate.toLocaleDateString()}
          </span>
        </div>
        <div className="text-muted-foreground flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          <span>{remainingDays} days remaining</span>
        </div>
        <div className="text-muted-foreground flex items-center gap-1.5">
          <Target className="h-3.5 w-3.5 shrink-0" />
          <span>Target: {formatMinutesDisplay(plan.targetMinutes)}</span>
        </div>
        <div className="text-muted-foreground flex items-center gap-1.5">
          <TrendingUp className="h-3.5 w-3.5 shrink-0" />
          <span>Studied: {formatMinutesDisplay(plan.actualMinutes)}</span>
        </div>
      </div>

      <div className="mt-3">
        <ProgressBar value={plan.studyProgressPercent} label="Study Progress" size="sm" />
      </div>
    </Link>
  )
}
