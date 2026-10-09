import type { Metadata } from 'next'
import { LayoutDashboard } from 'lucide-react'
import { PlaceholderPage } from '@/components/shared/placeholder-page'

export const metadata: Metadata = {
  title: 'Dashboard',
}

export default function DashboardPage() {
  return (
    <PlaceholderPage
      title="Dashboard"
      description="Your study overview at a glance — streak, weekly summary, recent sessions, and active goals."
      icon={LayoutDashboard}
      phase={2}
    />
  )
}
