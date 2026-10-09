import type { Metadata } from 'next'
import { ClipboardList } from 'lucide-react'
import { PlaceholderPage } from '@/components/shared/placeholder-page'

export const metadata: Metadata = {
  title: 'Planning',
}

export default function PlanningPage() {
  return (
    <PlaceholderPage
      title="Planning"
      description="Define your study plans, manage learning objectives (IELTS, TOEFL, General English), and organize your preparation strategy."
      icon={ClipboardList}
      phase={2}
    />
  )
}
