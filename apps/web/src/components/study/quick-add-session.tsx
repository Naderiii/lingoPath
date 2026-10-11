'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  useCreateSession,
  useSkills,
  useCategories,
  formatDuration,
} from '@/lib/hooks/use-sessions'
import { cn } from '@/lib/utils'

interface QuickAddSessionProps {
  onSuccess?: () => void
}

export function QuickAddSession({ onSuccess }: QuickAddSessionProps) {
  const [open, setOpen] = useState(false)
  const createSession = useCreateSession()
  const { data: skills = [] } = useSkills()
  const { data: categories = [] } = useCategories()

  const [skillId, setSkillId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [topic, setTopic] = useState('')
  const [notes, setNotes] = useState('')
  const [selfRating, setSelfRating] = useState<number | null>(null)
  const [durationHours, setDurationHours] = useState(0)
  const [durationMinutes, setDurationMinutes] = useState(30)
  const [date, setDate] = useState(() => {
    const now = new Date()
    return now.toISOString().split('T')[0]!
  })
  const [time, setTime] = useState(() => {
    const now = new Date()
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  })
  const [error, setError] = useState<string | null>(null)

  const resetForm = () => {
    setSkillId('')
    setCategoryId('')
    setTopic('')
    setNotes('')
    setSelfRating(null)
    setDurationHours(0)
    setDurationMinutes(30)
    setError(null)
    const now = new Date()
    setDate(now.toISOString().split('T')[0]!)
    setTime(
      `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
    )
  }

  const totalMinutes = durationHours * 60 + durationMinutes

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Validation
    if (!skillId) {
      setError('Please select a skill.')
      return
    }
    if (totalMinutes < 1) {
      setError('Duration must be at least 1 minute.')
      return
    }
    if (totalMinutes > 960) {
      setError('Duration cannot exceed 16 hours (960 minutes).')
      return
    }
    if (!date) {
      setError('Please select a date.')
      return
    }
    if (!time) {
      setError('Please select a time.')
      return
    }

    // Calculate startedAt and endedAt
    const startedAt = new Date(`${date}T${time}:00`).toISOString()
    const endedAt = new Date(
      new Date(`${date}T${time}:00`).getTime() + totalMinutes * 60_000,
    ).toISOString()

    // Validate the session is not in the future
    if (new Date(startedAt) > new Date()) {
      setError('Session start time cannot be in the future.')
      return
    }

    try {
      await createSession.mutateAsync({
        skillId,
        categoryId: categoryId || undefined,
        topic: topic || undefined,
        notes: notes || undefined,
        selfRating: selfRating ?? undefined,
        startedAt,
        endedAt,
        isManual: true,
      })

      resetForm()
      setOpen(false)
      onSuccess?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session')
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Quick Add
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Log Study Session</DialogTitle>
          <DialogDescription>Manually record a study session you completed.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Skill */}
          <div>
            <label className="text-sm font-medium" htmlFor="qa-skill">
              Skill *
            </label>
            <select
              id="qa-skill"
              value={skillId}
              onChange={(e) => setSkillId(e.target.value)}
              className="border-input bg-background mt-1 block w-full rounded-md border px-3 py-2 text-sm"
              required
            >
              <option value="">Select a skill...</option>
              {skills.map((skill) => (
                <option key={skill.id} value={skill.id}>
                  {skill.name}
                </option>
              ))}
            </select>
          </div>

          {/* Category */}
          <div>
            <label className="text-sm font-medium" htmlFor="qa-category">
              Category
            </label>
            <select
              id="qa-category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="border-input bg-background mt-1 block w-full rounded-md border px-3 py-2 text-sm"
            >
              <option value="">No category</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          {/* Duration */}
          <div>
            <label className="text-sm font-medium">Duration * ({formatDuration(totalMinutes)})</label>
            <div className="mt-1 flex gap-3">
              <div className="flex-1">
                <label className="text-muted-foreground text-xs" htmlFor="qa-hours">
                  Hours
                </label>
                <input
                  id="qa-hours"
                  type="number"
                  min={0}
                  max={16}
                  value={durationHours}
                  onChange={(e) => setDurationHours(Math.max(0, parseInt(e.target.value) || 0))}
                  className="border-input bg-background mt-0.5 block w-full rounded-md border px-3 py-2 text-sm"
                />
              </div>
              <div className="flex-1">
                <label className="text-muted-foreground text-xs" htmlFor="qa-minutes">
                  Minutes
                </label>
                <input
                  id="qa-minutes"
                  type="number"
                  min={0}
                  max={59}
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Math.max(0, parseInt(e.target.value) || 0))}
                  className="border-input bg-background mt-0.5 block w-full rounded-md border px-3 py-2 text-sm"
                />
              </div>
            </div>
          </div>

          {/* Date & Time */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-sm font-medium" htmlFor="qa-date">
                Date *
              </label>
              <input
                id="qa-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="border-input bg-background mt-1 block w-full rounded-md border px-3 py-2 text-sm"
                required
              />
            </div>
            <div className="flex-1">
              <label className="text-sm font-medium" htmlFor="qa-time">
                Time *
              </label>
              <input
                id="qa-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="border-input bg-background mt-1 block w-full rounded-md border px-3 py-2 text-sm"
                required
              />
            </div>
          </div>

          {/* Topic */}
          <div>
            <label className="text-sm font-medium" htmlFor="qa-topic">
              Topic
            </label>
            <input
              id="qa-topic"
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="What did you study?"
              className="border-input bg-background mt-1 block w-full rounded-md border px-3 py-2 text-sm"
              maxLength={200}
            />
          </div>

          {/* Notes */}
          <div>
            <label className="text-sm font-medium" htmlFor="qa-notes">
              Notes
            </label>
            <textarea
              id="qa-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any notes..."
              rows={3}
              className="border-input bg-background mt-1 block w-full rounded-md border px-3 py-2 text-sm"
              maxLength={2000}
            />
          </div>

          {/* Self Rating */}
          <div>
            <label className="text-sm font-medium">Self Rating</label>
            <div className="mt-1 flex gap-1">
              {[1, 2, 3, 4, 5].map((rating) => (
                <button
                  key={rating}
                  type="button"
                  onClick={() => setSelfRating(selfRating === rating ? null : rating)}
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-md border text-sm font-medium transition-colors',
                    selfRating === rating
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-input hover:bg-accent',
                  )}
                >
                  {rating}
                </button>
              ))}
            </div>
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createSession.isPending}>
              {createSession.isPending ? 'Saving...' : 'Save Session'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
