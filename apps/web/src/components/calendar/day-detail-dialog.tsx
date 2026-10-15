'use client'

import { Clock, FileText, Layers, ListChecks, Sparkles } from 'lucide-react'
import type { CalendarDayDetailResponse, CalendarIntensityLevel } from '@lingopath/types'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/shared/empty-state'
import { ErrorState } from '@/components/shared/error-state'
import { LoadingState } from '@/components/shared/loading-state'
import { useCalendarDay } from '@/lib/hooks/use-calendar'
import { formatDayLabel, formatMinutes, intensityLabelFor } from '@/lib/calendar'
import { cn } from '@/lib/utils'

interface DayDetailContentProps {
  detail: CalendarDayDetailResponse
  levels?: CalendarIntensityLevel[]
  className?: string
}

/**
 * Presentational body of the day drill-down: totals, per-skill/category/topic
 * distribution, notes and the individual sessions.
 */
export function DayDetailContent({ detail, levels = [], className }: DayDetailContentProps) {
  const shortfall = Math.max(0, detail.streakQualifyingMinutes - detail.totalMinutes)

  const chips = [
    levels.length > 0
      ? {
          label: intensityLabelFor(detail.intensity, levels),
          tone: 'neutral' as const,
        }
      : null,
    detail.sessionCount > 0
      ? detail.qualified
        ? { label: 'Counted toward streak', tone: 'good' as const }
        : { label: `${formatMinutes(shortfall)} short of streak`, tone: 'warn' as const }
      : { label: 'No sessions', tone: 'neutral' as const },
  ].filter((chip): chip is { label: string; tone: 'neutral' | 'good' | 'warn' } => chip !== null)

  const stats = [
    { label: 'Study time', value: formatMinutes(detail.totalMinutes), icon: Clock },
    { label: 'Sessions', value: `${detail.sessionCount}`, icon: ListChecks },
    {
      label: 'First – last',
      value:
        detail.firstSessionLocalTime && detail.lastSessionLocalTime
          ? `${detail.firstSessionLocalTime} – ${detail.lastSessionLocalTime}`
          : '—',
      icon: Sparkles,
    },
  ]

  return (
    <div className={cn('space-y-5', className)}>
      <div className="flex flex-wrap items-center gap-2">
        {chips.map((chip) => (
          <span
            key={chip.label}
            className={cn(
              'rounded-full px-2.5 py-1 text-xs font-medium',
              chip.tone === 'good' &&
                'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
              chip.tone === 'warn' &&
                'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
              chip.tone === 'neutral' && 'bg-accent-tint text-foreground',
            )}
          >
            {chip.label}
          </span>
        ))}
        <span className="text-muted-foreground text-xs">
          {detail.timezone} · counted as local days of {detail.streakQualifyingMinutes}m
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {stats.map((stat) => (
          <div key={stat.label} className="border-warm-border rounded-lg border p-3">
            <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <stat.icon className="h-3.5 w-3.5" />
              {stat.label}
            </div>
            <p className="mt-1 text-lg font-semibold tabular-nums">{stat.value}</p>
          </div>
        ))}
      </div>

      {detail.sessionCount === 0 ? (
        <EmptyState
          icon={Layers}
          title="No study on this day"
          description="Days without sessions are shown as empty cells and never count toward your streak."
        />
      ) : (
        <div className="space-y-5">
          <BreakdownList title="Skills" entries={detail.skills.map(toBarEntry)} />
          <BreakdownList title="Categories" entries={detail.categories.map(toBarEntry)} />
          {detail.topics.length > 0 && (
            <BreakdownList title="Topics" entries={detail.topics.map(toBarEntry)} />
          )}

          {detail.notes.length > 0 && (
            <section>
              <h4 className="mb-2 text-sm font-semibold">Notes</h4>
              <ul className="space-y-2">
                {detail.notes.map((note) => (
                  <li
                    key={note.sessionId}
                    className="border-warm-border border-l-primary/60 rounded-lg border border-l-2 p-3 text-sm"
                  >
                    <div className="text-muted-foreground mb-1 flex items-center justify-between text-xs">
                      <span>{note.topic ?? 'Untitled session'}</span>
                      <span>{formatMinutes(note.durationMinutes)}</span>
                    </div>
                    <p className="whitespace-pre-wrap">{note.notes}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h4 className="mb-2 text-sm font-semibold">Sessions</h4>
            <ul className="divide-warm-border divide-y">
              {detail.sessions.map((session) => (
                <li
                  key={session.id}
                  className="flex items-start justify-between gap-4 py-3 text-sm"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{session.skillName}</span>
                      {session.categoryName && (
                        <span className="text-muted-foreground text-xs">
                          {session.categoryName}
                        </span>
                      )}
                      {session.isManual && (
                        <span className="bg-accent-tint text-muted-foreground rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide">
                          manual
                        </span>
                      )}
                    </div>
                    <p className="text-muted-foreground truncate text-xs">
                      {session.topic ?? session.description ?? 'No topic'}
                    </p>
                    {session.planTitle && (
                      <p className="text-muted-foreground truncate text-xs">
                        Plan: {session.planTitle}
                        {session.milestoneTitle ? ` · ${session.milestoneTitle}` : ''}
                      </p>
                    )}
                    {session.notes?.trim() && (
                      <p className="text-muted-foreground flex items-start gap-1 text-xs">
                        <FileText className="mt-0.5 h-3 w-3 shrink-0" />
                        {session.notes}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-semibold tabular-nums">
                      {formatMinutes(session.durationMinutes)}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {formatTimeRange(session.startedAt, session.endedAt, detail.timezone)}
                    </p>
                    {session.selfRating !== null && (
                      <p className="text-muted-foreground text-xs">Rated {session.selfRating}/5</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  )
}

function toBarEntry(entry: { name?: string; topic?: string; minutes: number; percentage: number }) {
  return {
    key: entry.name ?? entry.topic ?? 'unknown',
    label: entry.name ?? entry.topic ?? 'Unknown',
    minutes: entry.minutes,
    percentage: entry.percentage,
  }
}

interface BreakdownListProps {
  title: string
  entries: Array<{ key: string; label: string; minutes: number; percentage: number }>
}

function BreakdownList({ title, entries }: BreakdownListProps) {
  if (entries.length === 0) return null

  return (
    <section>
      <h4 className="mb-2 text-sm font-semibold">{title}</h4>
      <ul className="space-y-2">
        {entries.map((entry) => (
          <li key={entry.key}>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span>{entry.label}</span>
              <span className="text-muted-foreground tabular-nums">
                {formatMinutes(entry.minutes)} · {entry.percentage}%
              </span>
            </div>
            <div className="bg-muted/40 h-2 w-full overflow-hidden rounded-full">
              <div
                className="bg-primary h-full rounded-full transition-all"
                style={{ width: `${Math.min(100, entry.percentage)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** `09:30 – 10:15` in the user's timezone, from the stored UTC instants. */
export function formatTimeRange(startedAt: string, endedAt: string, timeZone: string): string {
  return `${localTime(startedAt, timeZone)} – ${localTime(endedAt, timeZone)}`
}

function localTime(iso: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(iso))
  } catch {
    return '—'
  }
}

interface DayDetailDialogProps {
  date: string | null
  levels?: CalendarIntensityLevel[]
  onClose: () => void
}

/** Fetches the drill-down for the clicked day and renders it in a dialog. */
export function DayDetailDialog({ date, levels = [], onClose }: DayDetailDialogProps) {
  const { data, isLoading, isError, refetch } = useCalendarDay(date)

  return (
    <Dialog open={date !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{date ? formatDayLabel(date) : 'Day detail'}</DialogTitle>
          <DialogDescription>
            Everything you logged that day, by skill, category, topic and session.
          </DialogDescription>
        </DialogHeader>

        {isLoading && <LoadingState label="Loading day detail…" />}
        {isError && (
          <ErrorState
            title="Could not load this day"
            message="The day detail request failed. Please try again."
            onRetry={() => void refetch()}
          />
        )}
        {data && <DayDetailContent detail={data} levels={levels} />}
      </DialogContent>
    </Dialog>
  )
}
