import type { Metadata } from 'next'
import { ExamsPageClient } from '@/components/exams/exams-page-client'

export const metadata: Metadata = {
  title: 'Exams & Mock Tests | LingoPath',
  description:
    'Track IELTS and TOEFL exams, target bands and dates, and every recorded mock or real result over time.',
}

export default function ExamsPage() {
  return <ExamsPageClient />
}
