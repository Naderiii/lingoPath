import type { Metadata } from 'next'
import { RecommendationHistoryPageClient } from '@/components/recommendations/recommendation-history-page-client'

export const metadata: Metadata = {
  title: 'Suggestion history | LingoPath',
  description:
    'Every decision taken on a suggestion — accepted, adjusted, rejected or moved later — with the wording it carried at the time.',
}

export default function RecommendationHistoryPage() {
  return <RecommendationHistoryPageClient />
}
