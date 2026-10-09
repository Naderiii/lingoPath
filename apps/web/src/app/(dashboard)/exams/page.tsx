import type { Metadata } from 'next'
import { FileText } from 'lucide-react'
import { PlaceholderPage } from '@/components/shared/placeholder-page'

export const metadata: Metadata = {
  title: 'Exams & Mock Tests',
}

export default function ExamsPage() {
  return (
    <PlaceholderPage
      title="Exams & Mock Tests"
      description="Manage IELTS/TOEFL registrations, record mock exam results, and analyze section scores."
      icon={FileText}
      phase={3}
    />
  )
}
