'use client'

import { useMemo, useState } from 'react'
import { CalendarDays, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/shared/empty-state'
import { ErrorState } from '@/components/shared/error-state'
import { LoadingState } from '@/components/shared/loading-state'
import { CalendarSettingsDialog } from '@/components/calendar/calendar-settings-dialog'
import { DayDetailDialog } from '@/components/calendar/day-detail-dialog'
import { HeatmapSummary, StudyHeatmap } from '@/components/calendar/study-heatmap'
import { StreakCards } from '@/components/calendar/streak-cards'
import { useCalendarRange, useCalendarSettings, useStreak } from '@/lib/hooks/use-calendar'
import {
  defaultCustomRange,
  formatRangeLabel,
  parseDayKeyParts,
  validateRangeInputs,
  type WeekStartsOn,
} from '@/lib/calendar'
import { cn } from '@/lib/utils'

type ViewMode = 'current-year' | 'previous-year' | 'custom'

const VIEW_OPTIONS: Array<{ value: ViewMode; label: string }> = [
  { value: 'current-year', label: 'This year' },
  { value: 'previous-year', label: 'Last year' },
  { value: 'custom', label: 'Custom range' },
]

/**
 * `/calendar` — the GitHub-style study heatmap, streak summary and per-day
 * drill-down.
 *
 * The client never computes day boundaries: every day key comes from the API
 * already resolved in the user's configured timezone. That is what keeps midnight,
 * DST and month/year boundaries consistent between the grid, the streak cards and
 * the dashboard.
 */
export function CalendarPageClient() {
  const [view, setView] = useState<ViewMode>('current-year')
  const [weekStartsOn, setWeekStartsOn] = useState<WeekStartsOn>(0)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [draft, setDraft] = useState<{ from: string; to: string } | null>(null)
  const [applied, setApplied] = useState<{ from: string; to: string } | null>(null)
  const [rangeError, setRangeError] = useState<string | null>(null)

  const settingsQuery = useCalendarSettings()
  const settings = settingsQuery.data
  const today = settings?.today ?? null

  const rangeParams = useMemo(() => {
    if (view === 'custom') {
      return applied ? { from: applied.from, to: applied.to } : {}
    }
    if (today) {
      const { year } = parseDayKeyParts(today)
      return { year: view === 'previous-year' ? year - 1 : year }
    }
    // Settings still loading: let the API resolve the current year for us.
    return {}
  }, [view, applied, today])

  const calendarQuery = useCalendarRange(rangeParams)
  const streakQuery = useStreak()

  const calendar = calendarQuery.data
  const levels = calendar?.intensityLevels ?? settings?.intensityLevels ?? []

  const activeDraft = draft ?? (today ? defaultCustomRange(today) : { from: '', to: '' })

  const selectView = (next: ViewMode) => {
    setView(next)
    setRangeError(null)
    if (next === 'custom' && !draft && today) setDraft(defaultCustomRange(today))
  }

  const applyCustomRange = () => {
    const message = validateRangeInputs(activeDraft.from, activeDraft.to, today ?? '9999-12-31')
    if (message) {
      setRangeError(message)
      return
    }
    setRangeError(null)
    setApplied({ from: activeDraft.from, to: activeDraft.to })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Calendar</h2>
          <p className="text-muted-foreground mt-1">
            Every day you studied, coloured by how long you studied, measured in{' '}
            {settings?.timezone ?? 'your timezone'}.
          </p>
        </div>
        <Button variant="outline" className="gap-2" onClick={() => setSettingsOpen(true)}>
          <Settings2 className="h-4 w-4" />
          Thresholds
        </Button>
      </div>

      {/* Range selector */}
      <div className="flex flex-wrap items-center gap-2">
        {VIEW_OPTIONS.map((option) => (
          <Button
            key={option.value}
            variant={view === option.value ? 'default' : 'outline'}
            size="sm"
            aria-pressed={view === option.value}
            onClick={() => selectView(option.value)}
          >
            {option.label}
            {option.value === 'previous-year' && today
              ? ` (${parseDayKeyParts(today).year - 1})`
              : ''}
            {option.value === 'current-year' && today ? ` (${parseDayKeyParts(today).year})` : ''}
          </Button>
        ))}

        {view === 'custom' && (
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-muted-foreground text-xs" htmlFor="calendar-from">
              From
            </label>
            <input
              id="calendar-from"
              type="date"
              value={activeDraft.from}
              max={activeDraft.to || undefined}
              onChange={(event) => setDraft({ ...activeDraft, from: event.target.value })}
              className="border-warm-border bg-surface focus-visible:ring-ring h-9 rounded-md border px-3 text-sm focus-visible:outline-none focus-visible:ring-2"
            />
            <label className="text-muted-foreground text-xs" htmlFor="calendar-to">
              To
            </label>
            <input
              id="calendar-to"
              type="date"
              value={activeDraft.to}
              min={activeDraft.from || undefined}
              onChange={(event) => setDraft({ ...activeDraft, to: event.target.value })}
              className="border-warm-border bg-surface focus-visible:ring-ring h-9 rounded-md border px-3 text-sm focus-visible:outline-none focus-visible:ring-2"
            />
            <Button size="sm" onClick={applyCustomRange}>
              Apply
            </Button>
          </div>
        )}
      </div>

      {rangeError && <p className="text-destructive text-sm">{rangeError}</p>}

      <StreakCards streak={streakQuery.data} isLoading={streakQuery.isLoading} />

      {calendarQuery.isError ? (
        <Card>
          <CardContent className="p-0">
            <ErrorState
              title="Could not load your calendar"
              message="The calendar request failed. Check that the API is running, then try again."
              onRetry={() => void calendarQuery.refetch()}
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl font-bold">
                <CalendarDays className="h-5 w-5" />
                {calendar ? formatRangeLabel(calendar.range) : 'Study calendar'}
              </CardTitle>
              <p className="text-muted-foreground mt-1 text-sm">
                {calendar
                  ? `${calendar.summary.activeDays} active ${calendar.summary.activeDays === 1 ? 'day' : 'days'} · click any day for the details`
                  : 'Loading your study days…'}
              </p>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {calendarQuery.isLoading || !calendar ? (
              <LoadingState label="Loading study days…" />
            ) : (
              <>
                <HeatmapSummary
                  totalMinutes={calendar.summary.totalMinutes}
                  activeDays={calendar.summary.activeDays}
                  qualifyingDays={calendar.summary.qualifyingDays}
                  averageMinutesPerActiveDay={calendar.summary.averageMinutesPerActiveDay}
                  bestDay={calendar.summary.bestDay}
                  weekStartsOn={weekStartsOn}
                  onToggleWeekStart={() => setWeekStartsOn(weekStartsOn === 0 ? 1 : 0)}
                />

                {calendar.summary.activeDays === 0 && (
                  <EmptyState
                    icon={CalendarDays}
                    title="No study in this range yet"
                    description="Log a session from the Study page and it will appear here as a coloured day."
                  />
                )}

                <StudyHeatmap
                  days={calendar.days}
                  levels={levels}
                  today={calendar.today}
                  selectedDate={selectedDate}
                  weekStartsOn={weekStartsOn}
                  onSelectDay={setSelectedDate}
                  className={cn(calendar.summary.activeDays === 0 && 'opacity-70')}
                />
              </>
            )}
          </CardContent>
        </Card>
      )}

      <DayDetailDialog date={selectedDate} levels={levels} onClose={() => setSelectedDate(null)} />

      <CalendarSettingsDialog
        settings={settings}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />
    </div>
  )
}
