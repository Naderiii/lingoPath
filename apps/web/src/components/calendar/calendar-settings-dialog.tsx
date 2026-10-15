'use client'

import { useState } from 'react'
import { Plus, RotateCcw, Trash2 } from 'lucide-react'
import type { CalendarIntensityLevel, CalendarSettingsResponse } from '@lingopath/types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useUpdateCalendarSettings } from '@/lib/hooks/use-calendar'
import { cn } from '@/lib/utils'

/**
 * Mirrors the API defaults so the form has something to show before the settings
 * request settles and for the "reset" button. The values that actually drive the
 * heatmap always come from the server response.
 */
export const FALLBACK_INTENSITY_THRESHOLDS = [20, 40, 60, 90]
export const FALLBACK_STREAK_QUALIFYING_MINUTES = 20

/** Server-side limit on the number of buckets (see `calendar.domain.ts`). */
export const MAX_INTENSITY_THRESHOLDS = 7
const MAX_QUALIFYING_MINUTES = 24 * 60

interface ValidationResult {
  thresholds?: number[]
  qualifyingMinutes?: number
  error: string | null
}

/**
 * Turns the form's raw strings into a payload, or into a message the user can act
 * on. Kept pure and exported so the rules are unit-testable without rendering.
 */
export function validateSettingsForm(input: {
  thresholds: string[]
  qualifyingMinutes: string
}): ValidationResult {
  const parsed: number[] = []

  for (const raw of input.thresholds) {
    const value = Number(raw)
    if (raw.trim() === '' || !Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
      return { error: 'Every intensity bound must be a whole number of minutes above zero.' }
    }
    parsed.push(value)
  }

  if (parsed.length === 0) return { error: 'Keep at least one intensity bound.' }
  if (parsed.length > MAX_INTENSITY_THRESHOLDS) {
    return { error: `At most ${MAX_INTENSITY_THRESHOLDS} intensity bounds are supported.` }
  }
  if (new Set(parsed).size !== parsed.length) {
    return { error: 'Intensity bounds must be unique.' }
  }
  for (let index = 1; index < parsed.length; index++) {
    if (parsed[index]! <= parsed[index - 1]!) {
      return { error: 'Intensity bounds must increase from left to right.' }
    }
  }

  const qualifying = Number(input.qualifyingMinutes)
  if (
    input.qualifyingMinutes.trim() === '' ||
    !Number.isFinite(qualifying) ||
    !Number.isInteger(qualifying) ||
    qualifying < 0 ||
    qualifying > MAX_QUALIFYING_MINUTES
  ) {
    return {
      error: `A qualifying day must be a whole number of minutes between 0 and ${MAX_QUALIFYING_MINUTES}.`,
    }
  }

  return { thresholds: parsed, qualifyingMinutes: qualifying, error: null }
}

/** Describes the scale the current form values would produce. */
export function describeFormLevels(thresholds: string[]): CalendarIntensityLevel[] {
  const parsed = thresholds
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b)

  if (parsed.length === 0) return []

  const levels: CalendarIntensityLevel[] = [
    { level: 0, minMinutes: 0, maxMinutes: 0, label: 'No study' },
  ]
  parsed.forEach((max, index) => {
    const min = index === 0 ? 1 : parsed[index - 1]! + 1
    levels.push({ level: index + 1, minMinutes: min, maxMinutes: max, label: `${min}–${max} min` })
  })
  const last = parsed[parsed.length - 1]!
  levels.push({
    level: parsed.length + 1,
    minMinutes: last + 1,
    maxMinutes: null,
    label: `${last + 1}+ min`,
  })

  return levels
}

interface CalendarSettingsFormProps {
  settings: CalendarSettingsResponse | undefined
  onSaved: () => void
  onCancel: () => void
}

/**
 * The form itself. Mounted only while the dialog is open and keyed by the stored
 * configuration, so state seeds from the server values on every open without an
 * effect that would fight React Query.
 */
export function CalendarSettingsForm({ settings, onSaved, onCancel }: CalendarSettingsFormProps) {
  const [thresholds, setThresholds] = useState<string[]>(() =>
    (settings?.intensityThresholds ?? FALLBACK_INTENSITY_THRESHOLDS).map(String),
  )
  const [qualifyingMinutes, setQualifyingMinutes] = useState(() =>
    String(settings?.streakQualifyingMinutes ?? FALLBACK_STREAK_QUALIFYING_MINUTES),
  )
  const [validationError, setValidationError] = useState<string | null>(null)

  const updateSettings = useUpdateCalendarSettings()
  const preview = describeFormLevels(thresholds)

  const handleSave = () => {
    const result = validateSettingsForm({ thresholds, qualifyingMinutes })
    if (result.error) {
      setValidationError(result.error)
      return
    }

    setValidationError(null)
    updateSettings.mutate(
      {
        intensityThresholds: result.thresholds!,
        streakQualifyingMinutes: result.qualifyingMinutes!,
      },
      { onSuccess: () => onSaved() },
    )
  }

  return (
    <div className="space-y-5">
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-sm font-semibold">Intensity bounds (minutes)</h4>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => setThresholds(FALLBACK_INTENSITY_THRESHOLDS.map(String))}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Defaults
          </Button>
        </div>

        <ul className="space-y-2">
          {thresholds.map((value, index) => (
            <li key={index} className="flex items-center gap-2">
              <span className="text-muted-foreground w-24 text-xs">
                {index === 0 ? 'Level 1 up to' : `Level ${index + 1} up to`}
              </span>
              <input
                type="number"
                min={1}
                step={1}
                value={value}
                aria-label={`Intensity bound ${index + 1}`}
                onChange={(event) => {
                  const next = [...thresholds]
                  next[index] = event.target.value
                  setThresholds(next)
                }}
                className="border-warm-border bg-surface focus-visible:ring-ring h-9 w-24 rounded-md border px-3 text-sm focus-visible:outline-none focus-visible:ring-2"
              />
              <span className="text-muted-foreground text-xs">min</span>
              {thresholds.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove intensity bound ${index + 1}`}
                  onClick={() => setThresholds(thresholds.filter((_, i) => i !== index))}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>

        {thresholds.length < MAX_INTENSITY_THRESHOLDS && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => {
              const last = Number(thresholds[thresholds.length - 1] ?? 0)
              setThresholds([...thresholds, String(Number.isFinite(last) ? last + 30 : 30)])
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            Add bound
          </Button>
        )}

        {preview.length > 0 && (
          <div className="text-muted-foreground mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {preview.map((level) => (
              <span key={level.level}>{level.label}</span>
            ))}
          </div>
        )}
      </section>

      <section>
        <label className="mb-2 block text-sm font-semibold" htmlFor="streak-qualifying">
          A day counts as a streak day at (minutes)
        </label>
        <input
          id="streak-qualifying"
          type="number"
          min={0}
          step={1}
          value={qualifyingMinutes}
          onChange={(event) => setQualifyingMinutes(event.target.value)}
          className="border-warm-border bg-surface focus-visible:ring-ring h-9 w-28 rounded-md border px-3 text-sm focus-visible:outline-none focus-visible:ring-2"
        />
        <p className="text-muted-foreground mt-2 text-xs">
          Multiple sessions on the same day add up. The default is 20 minutes.
        </p>
      </section>

      {(validationError ?? updateSettings.error?.message) && (
        <p className={cn('text-destructive text-sm')}>
          {validationError ?? updateSettings.error?.message}
        </p>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" onClick={handleSave} disabled={updateSettings.isPending}>
          {updateSettings.isPending ? 'Saving…' : 'Save thresholds'}
        </Button>
      </DialogFooter>
    </div>
  )
}

interface CalendarSettingsDialogProps {
  settings: CalendarSettingsResponse | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Configures what the heatmap colours mean and what makes a day count for the
 * streak. Saving persists the preference through `PUT /api/v1/calendar/settings`.
 */
export function CalendarSettingsDialog({
  settings,
  open,
  onOpenChange,
}: CalendarSettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Calendar thresholds</DialogTitle>
          <DialogDescription>
            Set how study minutes map to heatmap intensity and how much study makes a day count
            toward your streak.
          </DialogDescription>
        </DialogHeader>

        {open && (
          <CalendarSettingsForm
            key={`${settings?.updatedAt ?? 'defaults'}-${settings?.source ?? 'DEFAULT'}`}
            settings={settings}
            onSaved={() => onOpenChange(false)}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
