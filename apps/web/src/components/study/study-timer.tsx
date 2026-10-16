'use client'

import { useState, useCallback } from 'react'
import { Play, Pause, Square, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useStudyTimer } from '@/lib/hooks/use-study-timer'
import {
  useCreateSession,
  useSkills,
  useCategories,
  formatTimerDisplay,
} from '@/lib/hooks/use-sessions'
import { cn } from '@/lib/utils'

interface StudyTimerProps {
  onSessionCreated?: () => void
}

/** Mirrors the server rule: a session records at least one minute of study. */
const MIN_SESSION_SECONDS = 60

export function StudyTimer({ onSessionCreated }: StudyTimerProps) {
  const timer = useStudyTimer()
  const createSession = useCreateSession()
  const { data: skills = [] } = useSkills()
  const { data: categories = [] } = useCategories()

  const [selectedSkillId, setSelectedSkillId] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const [notes, setNotes] = useState('')
  const [selfRating, setSelfRating] = useState<number | null>(null)
  const [topic, setTopic] = useState('')
  const [showStopForm, setShowStopForm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const handleStart = useCallback(() => {
    if (!selectedSkillId) {
      setError('Please select a skill before starting the timer.')
      return
    }
    setError(null)
    timer.start(selectedSkillId, selectedCategoryId || undefined)
  }, [selectedSkillId, selectedCategoryId, timer])

  const handlePause = useCallback(() => {
    timer.pause()
  }, [timer])

  const handleResume = useCallback(() => {
    timer.resume()
  }, [timer])

  const handleStopClick = useCallback(() => {
    setShowStopForm(true)
  }, [])

  const handleStopConfirm = useCallback(async () => {
    if (isSaving) return
    setIsSaving(true)
    setError(null)

    // Snapshot first: the timer keeps running until the session is actually saved,
    // so a failed request can be retried without losing the session.
    const result = timer.buildStopResult()
    if (!result) {
      setError('Timer was already stopped or an error occurred.')
      setIsSaving(false)
      return
    }

    try {
      await createSession.mutateAsync({
        skillId: result.skillId,
        categoryId: result.categoryId || undefined,
        topic: topic || undefined,
        notes: notes || undefined,
        selfRating: selfRating ?? undefined,
        startedAt: result.startedAt,
        endedAt: result.endedAt,
        isManual: false,
      })

      // Clear the timer only now that the session is persisted.
      timer.reset()

      // Reset form
      setNotes('')
      setTopic('')
      setSelfRating(null)
      setShowStopForm(false)
      onSessionCreated?.()
    } catch (err) {
      setError(
        err instanceof Error
          ? `${err.message} — your timer is still running, try saving again.`
          : 'Failed to save session — your timer is still running, try saving again.',
      )
    } finally {
      setIsSaving(false)
    }
  }, [timer, createSession, topic, notes, selfRating, onSessionCreated, isSaving])

  const handleReset = useCallback(() => {
    timer.reset()
    setShowStopForm(false)
    setError(null)
  }, [timer])

  const displaySkill = skills.find((s) => s.id === (timer.skillId ?? selectedSkillId))
  const canStop = timer.elapsedSeconds >= MIN_SESSION_SECONDS

  return (
    <div className="rounded-lg border p-6">
      <h3 className="mb-4 text-lg font-semibold">Study Timer</h3>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Timer Display */}
      <div className="mb-6 text-center">
        <div
          className={cn(
            'font-mono text-5xl font-bold tabular-nums',
            timer.status === 'running' && 'text-green-600 dark:text-green-400',
            timer.status === 'paused' && 'text-yellow-600 dark:text-yellow-400',
          )}
        >
          {formatTimerDisplay(timer.elapsedSeconds)}
        </div>
        {timer.isActive && displaySkill && (
          <p className="text-muted-foreground mt-2 text-sm">Studying: {displaySkill.name}</p>
        )}
        {timer.status === 'paused' && (
          <p className="mt-1 text-sm text-yellow-600 dark:text-yellow-400">Paused</p>
        )}
        {timer.isActive && !canStop && (
          <p className="text-muted-foreground mt-1 text-sm">
            Sessions under a minute are not saved — keep going.
          </p>
        )}
      </div>

      {/* Skill/Category Selection (only when idle) */}
      {!timer.isActive && (
        <div className="mb-4 space-y-3">
          <div>
            <label className="text-sm font-medium" htmlFor="timer-skill">
              Skill *
            </label>
            <select
              id="timer-skill"
              value={selectedSkillId}
              onChange={(e) => setSelectedSkillId(e.target.value)}
              className="border-input bg-background mt-1 block w-full rounded-md border px-3 py-2 text-sm"
            >
              <option value="">Select a skill...</option>
              {skills.map((skill) => (
                <option key={skill.id} value={skill.id}>
                  {skill.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium" htmlFor="timer-category">
              Category
            </label>
            <select
              id="timer-category"
              value={selectedCategoryId}
              onChange={(e) => setSelectedCategoryId(e.target.value)}
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
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center justify-center gap-3">
        {timer.status === 'idle' && (
          <Button onClick={handleStart} size="lg" className="gap-2">
            <Play className="h-4 w-4" />
            Start
          </Button>
        )}

        {timer.status === 'running' && (
          <>
            <Button onClick={handlePause} variant="outline" size="lg" className="gap-2">
              <Pause className="h-4 w-4" />
              Pause
            </Button>
            <Button
              onClick={handleStopClick}
              variant="destructive"
              size="lg"
              className="gap-2"
              disabled={!canStop}
              title={canStop ? undefined : 'Study at least 1 minute first'}
            >
              <Square className="h-4 w-4" />
              Stop
            </Button>
          </>
        )}

        {timer.status === 'paused' && (
          <>
            <Button onClick={handleResume} size="lg" className="gap-2">
              <Play className="h-4 w-4" />
              Resume
            </Button>
            <Button
              onClick={handleStopClick}
              variant="destructive"
              size="lg"
              className="gap-2"
              disabled={!canStop}
              title={canStop ? undefined : 'Study at least 1 minute first'}
            >
              <Square className="h-4 w-4" />
              Stop
            </Button>
            <Button onClick={handleReset} variant="ghost" size="lg" className="gap-2">
              <RotateCcw className="h-4 w-4" />
              Reset
            </Button>
          </>
        )}
      </div>

      {/* Stop Confirmation Form */}
      {showStopForm && timer.isActive && (
        <div className="mt-6 space-y-3 border-t pt-4">
          <h4 className="font-medium">Save Study Session</h4>
          <div>
            <label className="text-sm font-medium" htmlFor="stop-topic">
              Topic
            </label>
            <input
              id="stop-topic"
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="What did you study?"
              className="border-input bg-background mt-1 block w-full rounded-md border px-3 py-2 text-sm"
              maxLength={200}
            />
          </div>
          <div>
            <label className="text-sm font-medium" htmlFor="stop-notes">
              Notes
            </label>
            <textarea
              id="stop-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any notes about this session?"
              rows={3}
              className="border-input bg-background mt-1 block w-full rounded-md border px-3 py-2 text-sm"
              maxLength={2000}
            />
          </div>
          <div>
            <label className="text-sm font-medium">Self Rating</label>
            <div className="mt-1 flex gap-1">
              {[1, 2, 3, 4, 5].map((rating) => (
                <button
                  key={rating}
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
          <div className="flex gap-2">
            <Button onClick={handleStopConfirm} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save Session'}
            </Button>
            <Button variant="outline" onClick={() => setShowStopForm(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
