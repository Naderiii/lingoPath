import type { Metadata } from 'next'
import { StudyPageClient } from './study-page-client'

export const metadata: Metadata = {
  title: 'Study',
}

export default function StudyPage() {
  return <StudyPageClient />
}
