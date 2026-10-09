import type { Metadata } from 'next'
import { Timer } from 'lucide-react'
import { PlaceholderPage } from '@/components/shared/placeholder-page'

export const metadata: Metadata = {
  title: 'Study Timer',
}

export default function TimerPage() {
  return (
    <PlaceholderPage
      title="Study Timer"
      description="Start a timed study session. Choose a skill, start the timer, and save the session when finished."
      icon={Timer}
      phase={1}
    />
  )
}
