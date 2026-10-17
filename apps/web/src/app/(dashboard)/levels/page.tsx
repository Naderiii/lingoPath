import type { Metadata } from 'next'
import { LevelsPageClient } from '@/components/levels/levels-page-client'

export const metadata: Metadata = {
  title: 'CEFR Levels | LingoPath',
  description:
    'Record your CEFR levels — overall, listening, reading, writing and speaking — and follow how they change over time.',
}

export default function LevelsPage() {
  return <LevelsPageClient />
}
