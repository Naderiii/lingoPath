import type { Metadata } from 'next'
import { Target } from 'lucide-react'
import { PlaceholderPage } from '@/components/shared/placeholder-page'

export const metadata: Metadata = {
  title: 'Goals',
}

export default function GoalsPage() {
  return (
    <PlaceholderPage
      title="Goals"
      description="Set daily, weekly, monthly, and yearly study targets per skill. Track progress toward each goal."
      icon={Target}
      phase={2}
    />
  )
}
