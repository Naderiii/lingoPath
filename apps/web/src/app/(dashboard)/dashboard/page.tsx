'use client'

import { useDashboard } from '@/lib/hooks/use-dashboard'
import { TodayCard } from '@/components/dashboard/today-card'
import { ActivePlanCard } from '@/components/dashboard/active-plan-card'
import { GoalsCard } from '@/components/dashboard/goals-card'
import { WeekCard } from '@/components/dashboard/week-card'
import { SkillsCard } from '@/components/dashboard/skills-card'
import { ProgressCharts } from '@/components/dashboard/progress-charts'
import { RecentActivityCard } from '@/components/dashboard/recent-activity-card'
import { DashboardLoading } from '@/components/dashboard/dashboard-loading'
import { DashboardError } from '@/components/dashboard/dashboard-error'
import { DashboardEmpty } from '@/components/dashboard/dashboard-empty'

export default function DashboardPage() {
  const { data, isLoading, error, refetch } = useDashboard()

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Your study overview at a glance</p>
        </div>
        <DashboardLoading />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Your study overview at a glance</p>
        </div>
        <DashboardError error={error as Error} retry={() => refetch()} />
      </div>
    )
  }

  if (!data) {
    return null
  }

  // Check if user has any data
  const hasData =
    data.today.sessions > 0 ||
    data.recentActivity.length > 0 ||
    data.skills.length > 0 ||
    data.activePlan !== null ||
    data.activeGoals.length > 0

  if (!hasData) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Your study overview at a glance</p>
        </div>
        <DashboardEmpty />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Your study overview at a glance</p>
      </div>

      {/* Today Stats */}
      <TodayCard data={data.today} />

      {/* Active Plan (if exists) */}
      {data.activePlan && <ActivePlanCard data={data.activePlan} />}

      {/* Active Goals */}
      {data.activeGoals.length > 0 && <GoalsCard goals={data.activeGoals} />}

      {/* Week and Skills */}
      <div className="grid gap-6 md:grid-cols-2">
        <WeekCard data={data.thisWeek} />
        <SkillsCard data={data.skills} />
      </div>

      {/* Monthly and Yearly Progress */}
      <ProgressCharts monthlyData={data.monthlyProgress} yearlyData={data.yearlyProgress} />

      {/* Recent Activity */}
      <RecentActivityCard data={data.recentActivity} />
    </div>
  )
}
