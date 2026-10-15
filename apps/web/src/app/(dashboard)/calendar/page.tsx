import type { Metadata } from 'next'
import { CalendarPageClient } from '@/components/calendar/calendar-page-client'

export const metadata: Metadata = {
  title: 'Calendar | LingoPath',
  description:
    'See your study history as a GitHub-style heatmap, track your current and longest streak, and drill into any day.',
}

export default function CalendarPage() {
  return <CalendarPageClient />
}
