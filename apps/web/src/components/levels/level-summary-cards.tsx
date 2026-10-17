'use client'

import { Minus, TrendingDown, TrendingUp } from 'lucide-react'
import type { CefrLevel, LevelDimension, LevelDimensionSnapshot } from '@lingopath/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import {
  cefrTone,
  dimensionLabel,
  formatRecordedDate,
  METHOD_LABELS,
  previousRecordingLabel,
} from '@/lib/levels'

interface LevelSummaryCardsProps {
  /** Display order, decided by the API. */
  dimensions: LevelDimension[]
  current: Record<LevelDimension, LevelDimensionSnapshot | null>
  className?: string
}

function DirectionIcon({ snapshot }: { snapshot: LevelDimensionSnapshot }) {
  if (snapshot.changeDirection === 'up') {
    return <TrendingUp className="text-muted-foreground h-3.5 w-3.5" aria-hidden="true" />
  }
  if (snapshot.changeDirection === 'down') {
    return <TrendingDown className="text-muted-foreground h-3.5 w-3.5" aria-hidden="true" />
  }
  return <Minus className="text-muted-foreground h-3.5 w-3.5" aria-hidden="true" />
}

export function LevelBadge({ level, className }: { level: CefrLevel; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2.5 py-1 text-sm font-semibold',
        cefrTone(level),
        className,
      )}
    >
      {level}
    </span>
  )
}

/**
 * The most recently recorded level for each dimension.
 *
 * A dimension with no recording says "Not recorded" and stays empty — it is never
 * filled in from study activity, and no card carries a verdict about the learner.
 */
export function LevelSummaryCards({ dimensions, current, className }: LevelSummaryCardsProps) {
  return (
    <div className={cn('grid gap-4 sm:grid-cols-2 lg:grid-cols-5', className)}>
      {dimensions.map((dimension) => {
        const snapshot = current[dimension] ?? null
        const previous = snapshot ? previousRecordingLabel(snapshot) : null

        return (
          <Card key={dimension}>
            <CardHeader className="pb-2">
              <CardTitle className="text-muted-foreground text-sm font-medium">
                {dimensionLabel(dimension)}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {snapshot ? (
                <>
                  <div className="flex items-center gap-2">
                    <LevelBadge level={snapshot.level} />
                    <DirectionIcon snapshot={snapshot} />
                  </div>
                  <p className="text-muted-foreground text-xs">
                    Recorded {formatRecordedDate(snapshot.assessedAt)}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {METHOD_LABELS[snapshot.method] ?? snapshot.method}
                  </p>
                  {previous && <p className="text-muted-foreground text-xs">{previous}</p>}
                </>
              ) : (
                <>
                  <p className="text-muted-foreground text-sm">Not recorded</p>
                  <p className="text-muted-foreground text-xs">
                    Add an assessment to record a level for this dimension.
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
