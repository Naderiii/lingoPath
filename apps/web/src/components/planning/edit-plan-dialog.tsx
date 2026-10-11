'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  useUpdatePlan,
  useDeletePlan,
  type PlanDetail,
  type UpdatePlanInput,
} from '@/lib/hooks/use-plans'
import type { PlanStatus } from '@lingopath/types'

interface EditPlanDialogProps {
  plan: PlanDetail | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted?: () => void
}

interface FormValues {
  title: string
  description: string
  startDate: string
  endDate: string
  targetHours: number
  status: PlanStatus
}

export function EditPlanDialog({ plan, open, onOpenChange, onDeleted }: EditPlanDialogProps) {
  const updatePlan = useUpdatePlan()
  const deletePlan = useDeletePlan()
  const [serverError, setServerError] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>()

  useEffect(() => {
    if (plan && open) {
      reset({
        title: plan.title,
        description: plan.description ?? '',
        startDate: plan.startDate.slice(0, 10),
        endDate: plan.endDate.slice(0, 10),
        targetHours: Math.round(plan.targetMinutes / 60),
        status: plan.status,
      })
      setServerError(null)
      setShowDeleteConfirm(false)
    }
  }, [plan, open, reset])

  const onSubmit = async (values: FormValues) => {
    if (!plan) return
    setServerError(null)

    const startDate = new Date(values.startDate + 'T00:00:00.000Z')
    const endDate = new Date(values.endDate + 'T23:59:59.999Z')

    if (endDate <= startDate) {
      setServerError('End date must be after start date')
      return
    }

    const data: UpdatePlanInput = {
      title: values.title.trim(),
      description: values.description.trim() || null,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      targetMinutes: Math.round(values.targetHours * 60),
      status: values.status,
    }

    try {
      await updatePlan.mutateAsync({ id: plan.id, data })
      onOpenChange(false)
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Failed to update plan')
    }
  }

  const handleDelete = async () => {
    if (!plan) return
    try {
      await deletePlan.mutateAsync(plan.id)
      onOpenChange(false)
      onDeleted?.()
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Failed to delete plan')
    }
  }

  if (!plan) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Plan</DialogTitle>
          <DialogDescription>Update your study plan details.</DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="space-y-4">
          {/* Title */}
          <div>
            <label htmlFor="edit-title" className="text-sm font-medium">
              Plan Title
            </label>
            <input
              id="edit-title"
              {...register('title', {
                required: 'Title is required',
                maxLength: { value: 150, message: 'Title must be 150 characters or less' },
              })}
              className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring mt-1 flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            />
            {errors.title && (
              <p className="text-destructive mt-1 text-xs">{errors.title.message}</p>
            )}
          </div>

          {/* Description */}
          <div>
            <label htmlFor="edit-description" className="text-sm font-medium">
              Description
            </label>
            <textarea
              id="edit-description"
              {...register('description', {
                maxLength: { value: 2000, message: 'Description must be 2000 characters or less' },
              })}
              rows={3}
              className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring mt-1 flex w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            />
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="edit-startDate" className="text-sm font-medium">
                Start Date
              </label>
              <input
                id="edit-startDate"
                type="date"
                {...register('startDate', { required: 'Start date is required' })}
                className="border-input bg-background ring-offset-background focus-visible:ring-ring mt-1 flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              />
            </div>
            <div>
              <label htmlFor="edit-endDate" className="text-sm font-medium">
                End Date
              </label>
              <input
                id="edit-endDate"
                type="date"
                {...register('endDate', { required: 'End date is required' })}
                className="border-input bg-background ring-offset-background focus-visible:ring-ring mt-1 flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              />
            </div>
          </div>

          {/* Target Hours */}
          <div>
            <label htmlFor="edit-targetHours" className="text-sm font-medium">
              Target Study Hours
            </label>
            <input
              id="edit-targetHours"
              type="number"
              min={1}
              {...register('targetHours', {
                required: 'Target hours is required',
                min: { value: 1, message: 'Must be at least 1 hour' },
                valueAsNumber: true,
              })}
              className="border-input bg-background ring-offset-background focus-visible:ring-ring mt-1 flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            />
          </div>

          {/* Status */}
          <div>
            <label htmlFor="edit-status" className="text-sm font-medium">
              Status
            </label>
            <select
              id="edit-status"
              {...register('status')}
              className="border-input bg-background ring-offset-background focus-visible:ring-ring mt-1 flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            >
              <option value="ACTIVE">Active</option>
              <option value="COMPLETED">Completed</option>
              <option value="ARCHIVED">Archived</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>

          {serverError && (
            <div className="bg-destructive/10 text-destructive rounded-md p-3 text-sm">
              {serverError}
            </div>
          )}

          <DialogFooter className="gap-2">
            {!showDeleteConfirm ? (
              <Button
                type="button"
                variant="destructive"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={updatePlan.isPending || deletePlan.isPending}
                className="mr-auto"
              >
                Delete
              </Button>
            ) : (
              <div className="mr-auto flex items-center gap-2">
                <span className="text-destructive text-xs">Confirm delete?</span>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => void handleDelete()}
                  disabled={deletePlan.isPending}
                >
                  {deletePlan.isPending ? 'Deleting...' : 'Yes, Delete'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(false)}
                >
                  No
                </Button>
              </div>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={updatePlan.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={updatePlan.isPending}>
              {updatePlan.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
