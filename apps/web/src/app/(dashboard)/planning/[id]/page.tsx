'use client'

import { useParams } from 'next/navigation'
import { PlanDetailView } from '@/components/planning/plan-detail-view'

export default function PlanDetailPage() {
  const params = useParams<{ id: string }>()

  return <PlanDetailView planId={params.id} />
}
