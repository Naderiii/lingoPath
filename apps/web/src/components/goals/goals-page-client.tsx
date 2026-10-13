'use client'

import { useState } from 'react'
import { Plus, Filter } from 'lucide-react'
import { GoalList } from './goal-list'
import { CreateGoalDialog } from './create-goal-dialog'
import { GoalDetailDialog } from './goal-detail-dialog'
import { Button } from '@/components/ui/button'
import { useGoals, type GoalWithProgress } from '@/lib/hooks/use-goals'
import type { GoalPeriod } from '@lingopath/types'

export function GoalsPageClient() {
  const [createOpen, setCreateOpen] = useState(false)
  const [selectedGoal, setSelectedGoal] = useState<GoalWithProgress | null>(null)
  const [periodFilter, setPeriodFilter] = useState<GoalPeriod | 'ALL'>('ALL')
  const [activeFilter, setActiveFilter] = useState<boolean | undefined>(true)

  const { data, isLoading } = useGoals(
    periodFilter === 'ALL' ? undefined : periodFilter,
    activeFilter,
  )

  const goals = data?.data ?? []

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Goals</h2>
          <p className="text-muted-foreground mt-1">
            Set and track your study targets. Monitor progress toward daily, weekly, monthly, and
            yearly goals.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> New Goal
        </Button>
      </div>

      {/* Filters */}
      <div className="border-border flex flex-wrap items-center gap-3 rounded-lg border p-4">
        <div className="flex items-center gap-2">
          <Filter className="text-muted-foreground h-4 w-4" />
          <span className="text-muted-foreground text-sm font-medium">Filter:</span>
        </div>

        {/* Period Filter */}
        <div className="flex flex-wrap gap-2">
          {(['ALL', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const).map((period) => (
            <button
              key={period}
              onClick={() => setPeriodFilter(period)}
              className={
                periodFilter === period
                  ? 'bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-sm font-medium transition-colors'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80 rounded-md px-3 py-1.5 text-sm font-medium transition-colors'
              }
            >
              {period === 'ALL' ? 'All Periods' : period.charAt(0) + period.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        {/* Active Filter */}
        <div className="border-border ml-auto flex gap-2 border-l pl-3">
          <button
            onClick={() => setActiveFilter(true)}
            className={
              activeFilter === true
                ? 'bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-sm font-medium transition-colors'
                : 'bg-muted text-muted-foreground hover:bg-muted/80 rounded-md px-3 py-1.5 text-sm font-medium transition-colors'
            }
          >
            Active
          </button>
          <button
            onClick={() => setActiveFilter(undefined)}
            className={
              activeFilter === undefined
                ? 'bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-sm font-medium transition-colors'
                : 'bg-muted text-muted-foreground hover:bg-muted/80 rounded-md px-3 py-1.5 text-sm font-medium transition-colors'
            }
          >
            All
          </button>
        </div>
      </div>

      {/* Goal List */}
      <GoalList
        goals={goals}
        isLoading={isLoading}
        onGoalClick={setSelectedGoal}
        onCreateClick={() => setCreateOpen(true)}
      />

      {/* Dialogs */}
      <CreateGoalDialog open={createOpen} onOpenChange={setCreateOpen} />
      {selectedGoal && (
        <GoalDetailDialog
          goal={selectedGoal}
          open={!!selectedGoal}
          onOpenChange={(open) => !open && setSelectedGoal(null)}
        />
      )}
    </div>
  )
}
