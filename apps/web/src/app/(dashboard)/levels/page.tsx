import type { Metadata } from 'next'
import { TrendingUp } from 'lucide-react'
import { PlaceholderPage } from '@/components/shared/placeholder-page'

export const metadata: Metadata = {
  title: 'CEFR Levels',
}

export default function LevelsPage() {
  return (
    <PlaceholderPage
      title="CEFR Levels"
      description="Track your CEFR language proficiency assessments (A1 to C2) and milestone progress over time."
      icon={TrendingUp}
      phase={3}
    />
  )
}
