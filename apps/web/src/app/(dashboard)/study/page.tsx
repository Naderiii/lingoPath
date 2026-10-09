import type { Metadata } from 'next'
import { BookOpen } from 'lucide-react'
import { PlaceholderPage } from '@/components/shared/placeholder-page'

export const metadata: Metadata = {
  title: 'Study',
}

export default function StudyPage() {
  return (
    <PlaceholderPage
      title="Study"
      description="Log a new study session, review recent activity, and access the study timer."
      icon={BookOpen}
      phase={1}
    />
  )
}
