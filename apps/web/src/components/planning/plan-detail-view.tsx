'use client'

import { useState } from 'react'
import {
  ArrowLeft,
  Calendar,
  Clock,
  Settings,
  Plus,
  Target,
  TrendingUp,
  CheckCircle2,
  Archive,
  XCircle,
  RotateCcw,
} from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { ProgressBar } from './progress-bar'
import { MilestoneList } from './milestone-list'
import { EditPlanDialog } from './edit-plan-dialog'
import { CreateMilestoneDialog } from './create-milestone-dialog'
import {
  usePlanProgress,
  useUpdatePlan,
  getPlanStatusDisplay,
  formatMinutesDisplay,
} from '@/lib/hooks/use-plans'
import { Button } from '@/components/ui/button'
import { LoadingState } from '@/components/shared/loading-state'
import { ErrorState } from '@/components/shared/error-state'
import type { PlanStatus } from '@lingopath/types'

interface PlanDetailViewProps {
  planId: string
}

type ComparisonTab = 'total' | 'milestones' | 'monthly' | 'weekly'

export function PlanDetailView({ planId }: PlanDetailViewProps) {
  const { data, isLoading, isError, refetch } = usePlanProgress(planId)
  const updatePlan = useUpdatePlan()
  const [editOpen, setEditOpen] = useState(false)
  const [msOpen, setMsOpen] = useState(false)
  const [tab, setTab] = useState<ComparisonTab>('total')

  if (isLoading) return <LoadingState label="Loading plan..." />
  if (isError || !data) {
    return <ErrorState message="Failed to load plan details." onRetry={() => void refetch()} />
  }

  const { plan, progress, milestones, weeklyProgress, monthlyProgress } = data
  const statusDisplay = getPlanStatusDisplay(plan.status)

  const currentMilestone = milestones.find((m) => m.isCurrent)
  const nextMilestone = milestones.find((m) => m.isNext)

  const handleStatusChange = async (newStatus: PlanStatus) => {
    await updatePlan.mutateAsync({
      id: plan.id,
      data: { status: newStatus },
    })
  }

  // Calculate monthly target pace (pro-rated)
  const totalMonths = Math.max(1, monthlyProgress.length)
  const monthlyTargetMinutes = Math.round(progress.targetMinutes / totalMonths)

  // Calculate weekly target pace (pro-rated)
  const totalWeeks = Math.max(1, Math.ceil(progress.totalDays / 7))
  const weeklyTargetMinutes = Math.round(progress.targetMinutes / totalWeeks)

  return (
    <div className="space-y-6">
      {/* Back link + header */}
      <div>
        <Link
          href="/planning"
          className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-sm transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Plans
        </Link>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{plan.title}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                  statusDisplay.className,
                )}
              >
                {statusDisplay.label}
              </span>
              <span className="text-muted-foreground text-sm">
                {progress.remainingDays} days remaining
              </span>
              {plan.objective && (
                <span className="text-muted-foreground text-xs">
                  Objective: {plan.objective.title}
                </span>
              )}
            </div>
            {plan.description && (
              <p className="text-muted-foreground mt-2 text-sm">{plan.description}</p>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {plan.status === 'ACTIVE' ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleStatusChange('COMPLETED')}
                  disabled={updatePlan.isPending}
                  title="Mark plan as completed"
                >
                  <CheckCircle2 className="h-4 w-4 text-green-600" /> Complete
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleStatusChange('ARCHIVED')}
                  disabled={updatePlan.isPending}
                  title="Archive plan"
                >
                  <Archive className="h-4 w-4 text-muted-foreground" /> Archive
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleStatusChange('CANCELLED')}
                  disabled={updatePlan.isPending}
                  title="Cancel plan"
                >
                  <XCircle className="h-4 w-4 text-destructive" /> Cancel
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleStatusChange('ACTIVE')}
                disabled={updatePlan.isPending}
                title="Reactivate plan"
              >
                <RotateCcw className="h-4 w-4" /> Reactivate
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Settings className="h-4 w-4" /> Edit
            </Button>
          </div>
        </div>
      </div>

      {/* Progress Bars */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border p-4">
          <ProgressBar
            value={progress.timeProgressPercent}
            label="Time Progress"
            size="lg"
          />
          <p className="text-muted-foreground mt-2 text-center text-xs">
            {progress.elapsedDays} of {progress.totalDays} days elapsed ({Math.round(progress.timeProgressPercent)}%)
          </p>
        </div>
        <div className="rounded-lg border p-4">
          <ProgressBar
            value={progress.studyProgressPercent}
            label="Study Progress"
            size="lg"
          />
          <p className="text-muted-foreground mt-2 text-center text-xs">
            {progress.actualFormatted} of {progress.targetFormatted} completed ({Math.round(progress.studyProgressPercent)}%)
          </p>
        </div>
      </div>

      {/* Study Stats Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          icon={Target}
          label="Target"
          value={progress.targetFormatted}
        />
        <StatCard
          icon={TrendingUp}
          label="Completed"
          value={progress.actualFormatted}
          highlight={progress.isOverTarget}
        />
        <StatCard
          icon={Clock}
          label="Remaining"
          value={progress.remainingFormatted}
        />
        <StatCard
          icon={Calendar}
          label="Days Left"
          value={String(progress.remainingDays)}
        />
      </div>

      {/* Plan Details Info */}
      <div className="rounded-lg border p-4">
        <h3 className="mb-3 font-semibold">Plan Details</h3>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          <Detail label="Start Date" value={new Date(plan.startDate).toLocaleDateString()} />
          <Detail label="End Date" value={new Date(plan.endDate).toLocaleDateString()} />
          <Detail label="Total Duration" value={`${progress.totalDays} days`} />
          <Detail label="Elapsed Days" value={String(progress.elapsedDays)} />
          <Detail label="Remaining Days" value={String(progress.remainingDays)} />
          <Detail label="Time Elapsed" value={`${Math.round(progress.timeProgressPercent)}%`} />
          {currentMilestone && (
            <Detail label="Current Milestone" value={currentMilestone.title} />
          )}
          {nextMilestone && (
            <Detail label="Next Milestone" value={nextMilestone.title} />
          )}
        </div>
      </div>

      {/* Planned vs Actual */}
      <div className="rounded-lg border p-4">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="font-semibold">Planned vs Actual</h3>
          {/* View switcher tabs: Total, Milestone, Monthly, Weekly */}
          <div className="bg-muted inline-flex rounded-md p-1 text-xs">
            <button
              onClick={() => setTab('total')}
              className={cn(
                'rounded px-2.5 py-1 font-medium transition-colors',
                tab === 'total' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Total Plan
            </button>
            <button
              onClick={() => setTab('milestones')}
              className={cn(
                'rounded px-2.5 py-1 font-medium transition-colors',
                tab === 'milestones' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Milestone
            </button>
            <button
              onClick={() => setTab('monthly')}
              className={cn(
                'rounded px-2.5 py-1 font-medium transition-colors',
                tab === 'monthly' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Monthly
            </button>
            <button
              onClick={() => setTab('weekly')}
              className={cn(
                'rounded px-2.5 py-1 font-medium transition-colors',
                tab === 'weekly' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Weekly
            </button>
          </div>
        </div>

        {/* Comparison Header */}
        <div className="border-border text-muted-foreground mb-2 grid grid-cols-12 border-b pb-1.5 text-xs font-medium">
          <div className="col-span-4 sm:col-span-5">Period / Item</div>
          <div className="col-span-2 text-right">Target</div>
          <div className="col-span-2 text-right">Actual</div>
          <div className="col-span-2 text-right">Difference</div>
          <div className="col-span-2 text-right sm:col-span-1">Progress</div>
        </div>

        {/* Tab Content */}
        <div className="space-y-1.5 text-sm">
          {tab === 'total' && (
            <ComparisonRowGrid
              label="Total Plan"
              target={progress.targetMinutes}
              actual={progress.actualMinutes}
            />
          )}

          {tab === 'milestones' && (
            <>
              {milestones.length === 0 ? (
                <p className="text-muted-foreground py-3 text-center text-xs">No milestones defined.</p>
              ) : (
                milestones.map((m) => (
                  <ComparisonRowGrid
                    key={m.milestoneId}
                    label={m.title}
                    target={m.targetMinutes}
                    actual={m.actualMinutes}
                  />
                ))
              )}
            </>
          )}

          {tab === 'monthly' && (
            <>
              {monthlyProgress.length === 0 ? (
                <ComparisonRowGrid
                  label="Current Month"
                  target={monthlyTargetMinutes}
                  actual={0}
                />
              ) : (
                monthlyProgress.map((mp) => (
                  <ComparisonRowGrid
                    key={mp.month}
                    label={`Month: ${mp.month}`}
                    target={monthlyTargetMinutes}
                    actual={mp.totalMinutes}
                  />
                ))
              )}
            </>
          )}

          {tab === 'weekly' && (
            <>
              {weeklyProgress.length === 0 ? (
                <ComparisonRowGrid
                  label="Current Week"
                  target={weeklyTargetMinutes}
                  actual={0}
                />
              ) : (
                weeklyProgress.map((wp) => (
                  <ComparisonRowGrid
                    key={wp.weekStart}
                    label={`Week of ${wp.weekStart}`}
                    target={weeklyTargetMinutes}
                    actual={wp.totalMinutes}
                  />
                ))
              )}
            </>
          )}
        </div>
      </div>

      {/* Milestones Section */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">Milestones</h3>
          <Button variant="outline" size="sm" onClick={() => setMsOpen(true)}>
            <Plus className="h-4 w-4" /> Add Milestone
          </Button>
        </div>
        <MilestoneList milestones={milestones} planId={planId} />
      </div>

      {/* Dialogs */}
      <EditPlanDialog
        plan={plan}
        open={editOpen}
        onOpenChange={setEditOpen}
        onDeleted={() => {
          window.location.href = '/planning'
        }}
      />
      <CreateMilestoneDialog
        planId={planId}
        planStartDate={plan.startDate}
        planEndDate={plan.endDate}
        nextOrdering={milestones.length}
        open={msOpen}
        onOpenChange={setMsOpen}
      />
    </div>
  )
}

// ─── Helper Components ─────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  highlight,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className="rounded-lg border p-3 text-center">
      <Icon className="text-muted-foreground mx-auto h-5 w-5" />
      <p className="text-muted-foreground mt-1 text-xs">{label}</p>
      <p
        className={cn(
          'mt-0.5 text-lg font-semibold tabular-nums',
          highlight && 'text-green-600 dark:text-green-400',
        )}
      >
        {value}
      </p>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-muted-foreground text-xs">{label}</span>
      <p className="font-medium">{value}</p>
    </div>
  )
}

function ComparisonRowGrid({
  label,
  target,
  actual,
}: {
  label: string
  target: number
  actual: number
}) {
  const diff = actual - target
  const pct = target > 0 ? Math.round((actual / target) * 100) : 0

  return (
    <div className="hover:bg-muted/50 grid grid-cols-12 items-center rounded py-1 text-xs">
      <div className="col-span-4 truncate font-medium sm:col-span-5">{label}</div>
      <div className="text-muted-foreground col-span-2 text-right tabular-nums">
        {formatMinutesDisplay(target)}
      </div>
      <div className="col-span-2 text-right font-medium tabular-nums">
        {formatMinutesDisplay(actual)}
      </div>
      <div
        className={cn(
          'col-span-2 text-right tabular-nums',
          diff > 0
            ? 'text-green-600 dark:text-green-400 font-medium'
            : diff < 0
              ? 'text-orange-600 dark:text-orange-400'
              : 'text-muted-foreground',
        )}
      >
        {diff > 0 ? '+' : ''}
        {formatMinutesDisplay(diff)}
      </div>
      <div className="text-muted-foreground col-span-2 text-right tabular-nums sm:col-span-1">
        {pct}%
      </div>
    </div>
  )
}
