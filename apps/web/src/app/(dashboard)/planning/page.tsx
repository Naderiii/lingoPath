import type { Metadata } from 'next'
import { PlanningPageClient } from './planning-client'

export const metadata: Metadata = {
  title: 'Planning',
}

export default function PlanningPage() {
  return <PlanningPageClient />
}
