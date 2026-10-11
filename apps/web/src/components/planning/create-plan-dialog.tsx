'use client'

import { useState } from 'react'
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
import { useCreatePlan, type CreatePlanInput } from '@/lib/hooks/use-plans'

interface CreatePlanDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface FormValues {
  title: string
  description: string
  startDate: string
  endDate: string
  targetHours: number
}

export function CreatePlanDialog({ open, onOpenChange }: CreatePlanDialogProps) {
  const createPlan = useCreatePlan()
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      title: '',
      description: '',
      startDate: new Date().toISOString().slice(0, 10),
      endDate: '',
      targetHours: 100,
    },
  })

  const onSubmit = async (values: FormValues) => {
    setServerError(null)

    const startDate = new Date(values.startDate + 'T00:00:00.000Z')
    const endDate = new Date(values.endDate + 'T23:59:59.999Z')

    if (endDate <= startDate) {
      setServerError('End date must be after start date')
      return
    }

    const input: CreatePlanInput = {
      title: values.title.trim(),
      description: values.description.trim() || undefined,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      targetMinutes: Math.round(values.targetHours * 60),
      status: 'ACTIVE',
    }

    try {
      await createPlan.mutateAsync(input)
      reset()
      onOpenChange(false)
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Failed to create plan')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Study Plan</DialogTitle>
          <DialogDescription>
            Define a new long-term study plan with target hours and date range.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="space-y-4">
          {/* Title */}
          <div>
            <label htmlFor="title" className="text-sm font-medium">
              Plan Title
            </label>
            <input
              id="title"
              {...register('title', {
                required: 'Title is required',
                minLength: { value: 1, message: 'Title is required' },
                maxLength: { value: 150, message: 'Title must be 150 characters or less' },
              })}
              className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring mt-1 flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              placeholder="e.g. 6-Month IELTS Preparation"
            />
            {errors.title && (
              <p className="text-destructive mt-1 text-xs">{errors.title.message}</p>
            )}
          </div>

          {/* Description */}
          <div>
            <label htmlFor="description" className="text-sm font-medium">
              Description (optional)
            </label>
            <textarea
              id="description"
              {...register('description', {
                maxLength: { value: 2000, message: 'Description must be 2000 characters or less' },
              })}
              rows={3}
              className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring mt-1 flex w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              placeholder="Describe your learning goals..."
            />
            {errors.description && (
              <p className="text-destructive mt-1 text-xs">{errors.description.message}</p>
            )}
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="startDate" className="text-sm font-medium">
                Start Date
              </label>
              <input
                id="startDate"
                type="date"
                {...register('startDate', { required: 'Start date is required' })}
                className="border-input bg-background ring-offset-background focus-visible:ring-ring mt-1 flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              />
              {errors.startDate && (
                <p className="text-destructive mt-1 text-xs">{errors.startDate.message}</p>
              )}
            </div>
            <div>
              <label htmlFor="endDate" className="text-sm font-medium">
                End Date
              </label>
              <input
                id="endDate"
                type="date"
                {...register('endDate', { required: 'End date is required' })}
                className="border-input bg-background ring-offset-background focus-visible:ring-ring mt-1 flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              />
              {errors.endDate && (
                <p className="text-destructive mt-1 text-xs">{errors.endDate.message}</p>
              )}
            </div>
          </div>

          {/* Target Hours */}
          <div>
            <label htmlFor="targetHours" className="text-sm font-medium">
              Target Study Hours
            </label>
            <input
              id="targetHours"
              type="number"
              min={1}
              {...register('targetHours', {
                required: 'Target hours is required',
                min: { value: 1, message: 'Must be at least 1 hour' },
                valueAsNumber: true,
              })}
              className="border-input bg-background ring-offset-background focus-visible:ring-ring mt-1 flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              placeholder="e.g. 300"
            />
            {errors.targetHours && (
              <p className="text-destructive mt-1 text-xs">{errors.targetHours.message}</p>
            )}
          </div>

          {serverError && (
            <div className="bg-destructive/10 text-destructive rounded-md p-3 text-sm">
              {serverError}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={createPlan.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createPlan.isPending}>
              {createPlan.isPending ? 'Creating...' : 'Create Plan'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
