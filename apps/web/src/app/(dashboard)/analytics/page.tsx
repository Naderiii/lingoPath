import type { Metadata } from 'next'
import { AnalyticsPageClient } from '@/components/analytics/analytics-page-client'

export const metadata: Metadata = {
  title: 'Analytics | LingoPath',
  description:
    'Study time analytics: totals, streaks, skill breakdown, period comparisons and long-term plan pacing.',
}

export default function AnalyticsPage() {
  return <AnalyticsPageClient />
}
