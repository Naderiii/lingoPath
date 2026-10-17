import type { Metadata } from 'next'
import { RecommendationsPageClient } from '@/components/recommendations/recommendations-page-client'

export const metadata: Metadata = {
  title: 'Suggestions | LingoPath',
  description:
    'Suggestions built from your recorded study activity, goals and plans — each with the evidence behind it and an explicit confirmation before anything is added.',
}

export default function RecommendationsPage() {
  return <RecommendationsPageClient />
}
