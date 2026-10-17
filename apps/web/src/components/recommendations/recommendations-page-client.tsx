'use client'

/**
 * The full suggestion list.
 *
 * The dashboard shows three; this page shows all actionable rows and is the only
 * place that can ask for a new batch. Generation is a click, never a page load:
 * the pipeline costs a model call, and a learner opening a page has not asked for
 * one.
 */

import { useState } from 'react'
import Link from 'next/link'
import { History, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { RecommendationBoundary } from './recommendation-boundary'
import { RecommendationPanel } from './recommendation-panel'
import { useGenerateRecommendations } from '@/lib/hooks/use-recommendations'

export function RecommendationsPageClient() {
  const generate = useGenerateRecommendations()
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleGenerate() {
    setNotice(null)
    setError(null)
    try {
      const result = await generate.mutateAsync()
      const count = result.data.length
      const summary =
        count === 0
          ? 'No suggestion met the evidence bar this time.'
          : `Generated ${count} suggestion${count === 1 ? '' : 's'} from your recorded data.`
      const source =
        result.meta.llm.available === false
          ? ' The optional model service was unavailable, so the wording comes from built-in rules.'
          : ''
      setNotice(`${summary}${source}`)
    } catch {
      setError('Suggestions could not be refreshed. Your existing list is unchanged.')
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Suggestions</h2>
          <p className="text-muted-foreground mt-1">
            Observations from your own study record, ordered by how much evidence stands behind
            them.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/recommendations/history">
              <History className="h-4 w-4" />
              History
            </Link>
          </Button>
          <Button onClick={() => void handleGenerate()} disabled={generate.isPending}>
            <RefreshCw className="h-4 w-4" />
            {generate.isPending ? 'Looking…' : 'Refresh suggestions'}
          </Button>
        </div>
      </div>

      <div className="border-border bg-muted/40 text-muted-foreground flex items-start gap-2 rounded-lg border p-3 text-sm">
        <p>
          A suggestion describes what your recorded sessions, goals and plans show. It is not a
          readiness verdict, and it never becomes a study session. One item is added to your plan
          only after you confirm it, and you can adjust it first.
        </p>
      </div>

      {(notice !== null || error !== null) && (
        <p
          role={error !== null ? 'alert' : 'status'}
          className={error !== null ? 'text-destructive text-sm' : 'text-muted-foreground text-sm'}
        >
          {error ?? notice}
        </p>
      )}

      <RecommendationBoundary>
        <RecommendationPanel
          limit={20}
          emptyTitle="No suggestions yet"
          emptyDescription="LingoPath looks at your recorded study time, goals, plans and — if you have recorded them — levels and exam results. With little on file, there is nothing specific to say yet."
          emptyAction={
            <Button onClick={() => void handleGenerate()} disabled={generate.isPending}>
              <RefreshCw className="h-4 w-4" />
              {generate.isPending ? 'Looking…' : 'Look for suggestions'}
            </Button>
          }
        />
      </RecommendationBoundary>
    </div>
  )
}
