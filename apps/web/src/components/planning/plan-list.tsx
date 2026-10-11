'use client'

import { ClipboardList } from 'lucide-react'
import { usePlans } from '@/lib/hooks/use-plans'
import { PlanCard } from './plan-card'
import { EmptyState } from '@/components/shared/empty-state'
import { LoadingState } from '@/components/shared/loading-state'
import { ErrorState } from '@/components/shared/error-state'
import { Button } from '@/components/ui/button'

interface PlanListProps {
  onCreateClick: () => void
}

export function PlanList({ onCreateClick }: PlanListProps) {
  const { data, isLoading, isError, refetch } = usePlans()

  if (isLoading) return <LoadingState label="Loading plans..." />
  if (isError) return <ErrorState message="Failed to load plans." onRetry={() => void refetch()} />

  const plans = data?.data ?? []

  if (plans.length === 0) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="No study plans yet"
        description="Create your first long-term study plan to start tracking your progress."
        action={
          <Button onClick={onCreateClick}>Create Plan</Button>
        }
      />
    )
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {plans.map((plan) => (
        <PlanCard key={plan.id} plan={plan} />
      ))}
    </div>
  )
}
