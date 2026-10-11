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
import { useCreateMilestone, type CreateMilestoneInput } from '@/lib/hooks/use-plans'

interface CreateMilestoneDialogProps {
  planId: string
  planStartDate: string
  planEndDate: string
  nextOrdering: number
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

export function CreateMilestoneDialog({
  planId,
  planStartDate,
  planEndDate,
  nextOrdering,
  open,
  onOpenChange,
}: CreateMilestoneDialogProps) {
  const createMilestone = useCreateMilestone()
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
      startDate: planStartDate.slice(0, 10),
      endDate: '',
      targetHours: 50,
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

    const data: CreateMilestoneInput = {
      title: values.title.trim(),
      description: values.description.trim() || undefined,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      targetMinutes: Math.round(values.targetHours * 60),
      status: 'ACTIVE',
      ordering: nextOrdering,
    }

    try {
      await createMilestone.mutateAsync({ planId, data })
      reset()
      onOpenChange(false)
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Failed to create milestone')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Milestone</DialogTitle>
          <DialogDescription>
            Plan range: {planStartDate.slice(0, 10)} to {planEndDate.slice(0, 10)}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="space-y-4">
          <div>
            <label htmlFor="ms-title" className="text-sm font-medium">
              Milestone Title
            </label>
            <input
              id="ms-title"
              {...register('title', {
                required: 'Title is required',
                maxLength: { value: 150, message: 'Max 150 characters' },
              })}
              className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring mt-1 flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              placeholder="e.g. Foundation"
            />
            {errors.title && (
              <p className="text-destructive mt-1 text-xs">{errors.title.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="ms-description" className="text-sm font-medium">
              Description (optional)
            </label>
            <textarea
              id="ms-description"
              {...register('description')}
              rows={2}
              className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring mt-1 flex w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="ms-startDate" className="text-sm font-medium">
                Start Date
              </label>
              <input
                id="ms-startDate"
                type="date"
                {...register('startDate', { required: 'Required' })}
                className="border-input bg-background ring-offset-background focus-visible:ring-ring mt-1 flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              />
            </div>
            <div>
              <label htmlFor="ms-endDate" className="text-sm font-medium">
                End Date
              </label>
              <input
                id="ms-endDate"
                type="date"
                {...register('endDate', { required: 'Required' })}
                className="border-input bg-background ring-offset-background focus-visible:ring-ring mt-1 flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              />
            </div>
          </div>

          <div>
            <label htmlFor="ms-targetHours" className="text-sm font-medium">
              Target Hours
            </label>
            <input
              id="ms-targetHours"
              type="number"
              min={1}
              {...register('targetHours', {
                required: 'Required',
                min: { value: 1, message: 'Min 1 hour' },
                valueAsNumber: true,
              })}
              className="border-input bg-background ring-offset-background focus-visible:ring-ring mt-1 flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            />
          </div>

          {serverError && (
            <div className="bg-destructive/10 text-destructive rounded-md p-3 text-sm">
              {serverError}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMilestone.isPending}>
              {createMilestone.isPending ? 'Adding...' : 'Add Milestone'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
