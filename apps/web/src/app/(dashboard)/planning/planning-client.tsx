'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { PlanList } from '@/components/planning/plan-list'
import { CreatePlanDialog } from '@/components/planning/create-plan-dialog'
import { Button } from '@/components/ui/button'

export function PlanningPageClient() {
  const [createOpen, setCreateOpen] = useState(false)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Planning</h2>
          <p className="text-muted-foreground mt-1">
            Manage your long-term study plans and track your progress.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> New Plan
        </Button>
      </div>

      <PlanList onCreateClick={() => setCreateOpen(true)} />
      <CreatePlanDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}
