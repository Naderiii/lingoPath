import type { Metadata } from 'next'
import { GoalsPageClient } from '@/components/goals/goals-page-client'

export const metadata: Metadata = {
  title: 'Goals | LingoPath',
  description:
    'Set and track your study targets. Monitor progress toward daily, weekly, monthly, and yearly goals.',
}

export default function GoalsPage() {
  return <GoalsPageClient />
}
