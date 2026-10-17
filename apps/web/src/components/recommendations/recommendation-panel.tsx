'use client'

/**
 * The suggestion list, with its two-step decision flow.
 *
 * The list is capped by the caller (`limit`), and the cap is applied to the data,
 * not to the layout — a fourth suggestion is never rendered and hidden with CSS.
 *
 * Failure is contained: this panel owns its own loading, empty and error states,
 * so a recommendation service that is down leaves the rest of the dashboard
 * exactly as it was. Nothing here retries forever, and nothing here generates on
 * its own — a generation run is always a click.
 */

import { useState, type ReactNode } from 'react'
import { Info } from 'lucide-react'
import type { Recommendation } from '@lingopath/types'
import { Button } from '@/components/ui/button'
import {
  useActionableRecommendations,
  useRecommendationFeedback,
} from '@/lib/hooks/use-recommendations'
import {
  PRIMARY_RECOMMENDATION_LIMIT,
  requestErrorMessage,
  selectPrimaryRecommendations,
  usesBuiltInRules,
} from '@/lib/recommendations'
import { PlanItemDialog } from './plan-item-dialog'
import { RecommendationCard } from './recommendation-card'
import { RejectRecommendationDialog } from './reject-recommendation-dialog'

interface RecommendationPanelProps {
  limit?: number
  emptyTitle?: string
  emptyDescription?: string
  emptyAction?: ReactNode
}

interface PlanDialogState {
  recommendation: Recommendation
  mode: 'confirm' | 'modify'
}

export function RecommendationPanel({
  limit = PRIMARY_RECOMMENDATION_LIMIT,
  emptyTitle = 'No suggestions right now',
  emptyDescription = 'Suggestions appear when your study record shows something worth acting on.',
  emptyAction,
}: RecommendationPanelProps) {
  const query = useActionableRecommendations()
  const feedback = useRecommendationFeedback()

  const [planDialog, setPlanDialog] = useState<PlanDialogState | null>(null)
  const [rejectTarget, setRejectTarget] = useState<Recommendation | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const items = selectPrimaryRecommendations(query.data?.data ?? [], limit)

  async function handleAccept(recommendation: Recommendation) {
    setNotice(null)
    if (recommendation.status === 'NEW') {
      try {
        const result = await feedback.mutateAsync({ id: recommendation.id, action: 'ACCEPTED' })
        setPlanDialog({ recommendation: result.data, mode: 'confirm' })
      } catch (error) {
        setNotice(
          requestErrorMessage(
            error,
            'That decision could not be recorded. Nothing was added to your plan.',
          ),
        )
      }
      return
    }
    setPlanDialog({ recommendation, mode: 'confirm' })
  }

  async function handleLater(recommendation: Recommendation) {
    setNotice(null)
    try {
      await feedback.mutateAsync({ id: recommendation.id, action: 'POSTPONED' })
      setNotice('Moved out of your suggestions. It stays in your history.')
    } catch (error) {
      setNotice(
        requestErrorMessage(error, 'That suggestion could not be moved. Nothing was changed.'),
      )
    }
  }

  if (query.isLoading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading suggestions">
        <div className="bg-muted/50 h-24 animate-pulse rounded-lg" />
        <div className="bg-muted/50 h-24 animate-pulse rounded-lg" />
      </div>
    )
  }

  if (query.isError) {
    return (
      <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
        <p>Suggestions are unavailable right now. Everything else on this page is unaffected.</p>
        <Button variant="ghost" size="sm" onClick={() => void query.refetch()}>
          Try again
        </Button>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-foreground text-sm font-medium">{emptyTitle}</p>
        <p className="text-muted-foreground text-sm">{emptyDescription}</p>
        {emptyAction !== undefined && <div className="pt-1">{emptyAction}</div>}
        {notice !== null && (
          <p role="status" className="text-muted-foreground text-xs">
            {notice}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {items.map((recommendation) => (
        <RecommendationCard
          key={recommendation.id}
          recommendation={recommendation}
          onAccept={(item) => void handleAccept(item)}
          onModify={(item) => {
            setNotice(null)
            setPlanDialog({ recommendation: item, mode: 'modify' })
          }}
          onReject={(item) => {
            setNotice(null)
            setRejectTarget(item)
          }}
          onLater={(item) => void handleLater(item)}
          busy={feedback.isPending}
        />
      ))}

      {usesBuiltInRules(items) && (
        <p className="text-muted-foreground/80 flex items-start gap-1.5 text-xs">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            These suggestions are computed from your recorded data by LingoPath’s built-in rules.
            The optional model service is not used for this wording.
          </span>
        </p>
      )}

      {notice !== null && (
        <p role="status" className="text-muted-foreground text-xs">
          {notice}
        </p>
      )}

      <PlanItemDialog
        open={planDialog !== null}
        onOpenChange={(open) => {
          if (!open) setPlanDialog(null)
        }}
        recommendation={planDialog?.recommendation ?? null}
        initialMode={planDialog?.mode ?? 'confirm'}
        onAdded={(message) => setNotice(message)}
      />

      <RejectRecommendationDialog
        open={rejectTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRejectTarget(null)
        }}
        recommendation={rejectTarget}
        onRejected={(message) => setNotice(message)}
      />
    </div>
  )
}
