'use client'

/**
 * Rejecting is a first-class answer, not a dismissal.
 *
 * The reason is optional on purpose: the learner may simply not want the
 * suggestion, and forcing a justification would turn a two-second decision into
 * homework. When a reason is given it is stored with the decision and shown in
 * the history, where the learner — not a model — can act on it later.
 */

import { useEffect, useState } from 'react'
import type { Recommendation } from '@lingopath/types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useRecommendationFeedback } from '@/lib/hooks/use-recommendations'
import { requestErrorMessage } from '@/lib/recommendations'

const MAX_REASON_LENGTH = 500

interface RejectRecommendationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  recommendation: Recommendation | null
  onRejected: (message: string) => void
}

export function RejectRecommendationDialog({
  open,
  onOpenChange,
  recommendation,
  onRejected,
}: RejectRecommendationDialogProps) {
  const feedback = useRecommendationFeedback()
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setReason('')
    setError(null)
  }, [open])

  async function handleReject() {
    if (recommendation === null) return
    setError(null)
    try {
      await feedback.mutateAsync({
        id: recommendation.id,
        action: 'REJECTED',
        ...(reason.trim().length > 0 ? { reason: reason.trim() } : {}),
      })
      onRejected('Rejected. It stays in your history with the reason you gave.')
      onOpenChange(false)
    } catch (error) {
      setError(
        requestErrorMessage(error, 'The decision could not be recorded. Nothing was changed.'),
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reject this suggestion?</DialogTitle>
          <DialogDescription>
            It leaves your suggestions and keeps its wording in your history. No plan data changes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <label htmlFor="reject-reason" className="text-sm font-medium">
            Reason (optional)
          </label>
          <textarea
            id="reject-reason"
            rows={3}
            maxLength={MAX_REASON_LENGTH}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Not the right focus for this month"
            className="border-input bg-background ring-offset-background focus-visible:ring-ring flex w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          />
          <p className="text-muted-foreground text-xs">
            {reason.trim().length}/{MAX_REASON_LENGTH} characters. A reason is for you; it is not
            sent anywhere else.
          </p>
          {error !== null && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={feedback.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => void handleReject()}
            disabled={feedback.isPending}
          >
            {feedback.isPending ? 'Rejecting…' : 'Reject suggestion'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
