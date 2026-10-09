import type { Metadata } from 'next'
import { CalendarDays } from 'lucide-react'
import { PlaceholderPage } from '@/components/shared/placeholder-page'

export const metadata: Metadata = {
  title: 'Calendar',
}

export default function CalendarPage() {
  return (
    <PlaceholderPage
      title="Calendar"
      description="View your study sessions on a calendar. See daily, weekly, and monthly study patterns."
      icon={CalendarDays}
      phase={2}
    />
  )
}
