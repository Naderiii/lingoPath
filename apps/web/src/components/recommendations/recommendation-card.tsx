'use client'

/**
 * One suggestion, with the facts it was built from.
 *
 * The card is deliberately quiet: no sparkle icon, no accent gradient, no chat
 * affordance. It reads like a short note in a study log — claim, reason, evidence,
 * cost in minutes — followed by four plain choices. The learner can always see why
 * the suggestion exists, which is what keeps it from reading as a verdict.
 */

import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import type { Recommendation } from '@lingopath/types'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { formatMinutes } from '@/lib/calendar'
import {
  confidenceExplanation,
  confidenceLabel,
  evidenceSourceLabel,
  recommendationTypeLabel,
  statusLabel,
} from '@/lib/recommendations'

interface RecommendationCardProps {
  recommendation: Recommendation
  onAccept: (recommendation: Recommendation) => void
  onModify: (recommendation: Recommendation) => void
  onReject: (recommendation: Recommendation) => void
  onLater: (recommendation: Recommendation) => void
  busy?: boolean
}

export function RecommendationCard({
  recommendation,
  onAccept,
  onModify,
  onReject,
  onLater,
  busy = false,
}: RecommendationCardProps) {
  const accepted = recommendation.status !== 'NEW' && recommendation.appliedAt === null
  const primaryLabel = accepted ? 'Add to today’s plan' : 'Accept'

  return (
    <Card className="p-4">
      <article aria-labelledby={`recommendation-${recommendation.id}`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                {recommendationTypeLabel(recommendation.type)}
              </span>
              {recommendation.status !== 'NEW' && (
                <span className="bg-accent text-accent-foreground rounded-full px-2 py-0.5 text-xs font-medium">
                  {statusLabel(recommendation.status, recommendation.appliedAt)}
                </span>
              )}
            </div>
            <h3
              id={`recommendation-${recommendation.id}`}
              className="text-foreground mt-1 font-semibold"
            >
              {recommendation.title}
            </h3>
          </div>
          <span
            className="border-border text-muted-foreground shrink-0 rounded-full border px-2 py-0.5 text-xs"
            title={recommendation.confidenceBasis}
          >
            Confidence: {confidenceLabel(recommendation.confidence)}
          </span>
        </div>

        <p className="text-foreground mt-3 text-sm">{recommendation.recommendation}</p>

        <div className="mt-3">
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Why</p>
          <p className="text-muted-foreground mt-1 text-sm">{recommendation.rationale}</p>
        </div>

        {recommendation.supportingData.length > 0 && (
          <div className="mt-3">
            <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
              Based on
            </p>
            <ul className="mt-1 space-y-1">
              {recommendation.supportingData.map((point, index) => (
                <li
                  key={`${point.label}-${point.source}-${index}`}
                  className="flex flex-wrap items-baseline gap-x-2 text-sm"
                >
                  <span className="text-muted-foreground">{point.label}</span>
                  <span className="text-foreground font-medium">{point.value}</span>
                  <span className="text-muted-foreground/80 text-xs">
                    {evidenceSourceLabel(point.source)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <dl className="border-border mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t pt-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
              Est. duration
            </dt>
            <dd className="text-foreground mt-0.5">
              {recommendation.estimatedDurationMinutes === null
                ? 'Not set'
                : formatMinutes(recommendation.estimatedDurationMinutes)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
              Skill
            </dt>
            <dd className="text-foreground mt-0.5">
              {recommendation.relatedSkillName ?? 'Not specific'}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
              Related
            </dt>
            <dd className="text-foreground mt-0.5">
              <span className="flex flex-wrap gap-x-2">
                {recommendation.relatedGoalId !== null && (
                  <Link
                    href="/goals"
                    className="text-primary inline-flex items-center gap-0.5 hover:underline"
                  >
                    Goal
                    <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                  </Link>
                )}
                {recommendation.relatedPlanId !== null && (
                  <Link
                    href={`/planning/${recommendation.relatedPlanId}`}
                    className="text-primary inline-flex items-center gap-0.5 hover:underline"
                  >
                    Plan
                    <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                  </Link>
                )}
                {recommendation.relatedGoalId === null && recommendation.relatedPlanId === null && (
                  <span>None</span>
                )}
              </span>
            </dd>
          </div>
        </dl>

        <p className="text-muted-foreground mt-2 text-xs">
          {confidenceExplanation(recommendation.confidenceBasis)}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={() => onAccept(recommendation)}
            disabled={busy}
            aria-label={`${primaryLabel}: ${recommendation.title}`}
          >
            {primaryLabel}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onModify(recommendation)}
            disabled={busy}
            aria-label={`Modify: ${recommendation.title}`}
          >
            Modify
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onReject(recommendation)}
            disabled={busy}
            aria-label={`Reject: ${recommendation.title}`}
          >
            Reject
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onLater(recommendation)}
            disabled={busy}
            aria-label={`Later: ${recommendation.title}`}
          >
            Later
          </Button>
        </div>
      </article>
    </Card>
  )
}
