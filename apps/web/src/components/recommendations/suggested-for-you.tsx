'use client'

/**
 * Dashboard section: at most three suggestions, after the learner's own numbers.
 *
 * It sits below today's progress, the active plan and the active goals on purpose.
 * Recommendations are commentary on recorded data; they must never be the first
 * thing, and the section can disappear entirely without the dashboard losing
 * meaning.
 */

import Link from 'next/link'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { PRIMARY_RECOMMENDATION_LIMIT } from '@/lib/recommendations'
import { RecommendationBoundary } from './recommendation-boundary'
import { RecommendationPanel } from './recommendation-panel'

export function SuggestedForYou() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">Suggested for you</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              From your recorded sessions, goals and plans. Nothing changes until you confirm.
            </p>
          </div>
          <Link
            href="/recommendations/history"
            className="text-primary text-sm font-medium hover:underline"
          >
            History
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        <RecommendationBoundary>
          <RecommendationPanel
            limit={PRIMARY_RECOMMENDATION_LIMIT}
            emptyTitle="No suggestions yet"
            emptyDescription="Suggestions are generated on request from your recorded sessions, goals and plans."
            emptyAction={
              <Link
                href="/recommendations"
                className="text-primary text-sm font-medium hover:underline"
              >
                Open suggestions
              </Link>
            }
          />
        </RecommendationBoundary>
      </CardContent>
    </Card>
  )
}
