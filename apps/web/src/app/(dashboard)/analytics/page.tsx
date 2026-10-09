import type { Metadata } from 'next'
import { BarChart3 } from 'lucide-react'
import { PlaceholderPage } from '@/components/shared/placeholder-page'

export const metadata: Metadata = {
  title: 'Analytics',
}

export default function AnalyticsPage() {
  return (
    <PlaceholderPage
      title="Analytics"
      description="Visualize study time distribution, consistency heatmaps, skill progress over time, and historical period comparisons."
      icon={BarChart3}
      phase={3}
    />
  )
}
