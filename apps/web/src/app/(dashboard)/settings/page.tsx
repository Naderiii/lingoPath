import type { Metadata } from 'next'
import { Settings } from 'lucide-react'
import { PlaceholderPage } from '@/components/shared/placeholder-page'

export const metadata: Metadata = {
  title: 'Settings',
}

export default function SettingsPage() {
  return (
    <PlaceholderPage
      title="Settings"
      description="Configure user profile, timezone preferences, study reminders, and system parameters."
      icon={Settings}
      phase={1}
    />
  )
}
