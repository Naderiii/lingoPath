import type { Metadata } from 'next'
import { History } from 'lucide-react'
import { PlaceholderPage } from '@/components/shared/placeholder-page'

export const metadata: Metadata = {
  title: 'Study History',
}

export default function HistoryPage() {
  return (
    <PlaceholderPage
      title="Study History"
      description="Browse and filter all past study sessions. Edit or delete individual entries."
      icon={History}
      phase={1}
    />
  )
}
