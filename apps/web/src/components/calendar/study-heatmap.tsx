'use client'

import { useMemo, useRef } from 'react'
import type { CalendarDay, CalendarIntensityLevel } from '@lingopath/types'
import { cn } from '@/lib/utils'
import {
  WEEKDAY_LABELS,
  addDaysToKey,
  buildHeatmapColumns,
  buildMonthLabels,
  dayAriaLabel,
  dayTooltip,
  formatMinutes,
  intensityClass,
  type WeekStartsOn,
} from '@/lib/calendar'

interface StudyHeatmapProps {
  /** One entry per day of the requested range, including zero-minute days. */
  days: CalendarDay[]
  /** Server-provided bucket definitions — the legend and tooltips use these. */
  levels: CalendarIntensityLevel[]
  /** Today in the user's timezone, used to ring the current day. */
  today: string
  selectedDate?: string | null
  weekStartsOn?: WeekStartsOn
  onSelectDay: (date: string) => void
  className?: string
}

/**
 * GitHub-style study heatmap.
 *
 * Layout: one column per week, one row per weekday, padded so the grid always
 * forms full weeks. Colours come from the configurable intensity buckets, so the
 * scale on screen is exactly the scale the server applied.
 *
 * Accessibility: a real `<table>` (weekday row headers, month column headers)
 * whose cells are buttons labelled with the full date, duration and session
 * count; arrow keys move focus a day or a week at a time.
 */
export function StudyHeatmap({
  days,
  levels,
  today,
  selectedDate = null,
  weekStartsOn = 0,
  onSelectDay,
  className,
}: StudyHeatmapProps) {
  const columns = useMemo(() => buildHeatmapColumns(days, weekStartsOn), [days, weekStartsOn])
  const labels = useMemo(() => buildMonthLabels(columns), [columns])
  const labelByColumn = useMemo(
    () => new Map(labels.map((entry) => [entry.columnIndex, entry.label])),
    [labels],
  )

  const cellRefs = useRef(new Map<string, HTMLButtonElement>())

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, date: string) => {
    const deltas: Record<string, number> = {
      ArrowRight: 7,
      ArrowLeft: -7,
      ArrowDown: 1,
      ArrowUp: -1,
    }
    const delta = deltas[event.key]
    if (delta === undefined) return

    const target = addDaysToKey(date, delta)
    const node = cellRefs.current.get(target)
    if (!node) return

    event.preventDefault()
    node.focus()
  }

  if (columns.length === 0) {
    return (
      <p className={cn('text-muted-foreground py-8 text-center text-sm', className)}>
        No days to display for this range.
      </p>
    )
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div className="overflow-x-auto pb-1">
        <table className="border-separate border-spacing-[3px]" aria-label="Study activity by day">
          <caption className="sr-only">
            Daily study time for the selected range. Use the arrow keys to move between days and
            press Enter to open a day.
          </caption>
          <thead>
            <tr>
              <th scope="col" aria-hidden="true" className="w-8" />
              {columns.map((_, columnIndex) => (
                <th
                  key={columnIndex}
                  scope="col"
                  className="text-muted-foreground h-4 text-left text-[10px] font-medium leading-4"
                >
                  {labelByColumn.get(columnIndex) ?? ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 7 }).map((_, row) => (
              <tr key={row}>
                <th
                  scope="row"
                  className="text-muted-foreground w-8 pr-1 text-right text-[10px] font-medium"
                >
                  {row % 2 === 1 ? WEEKDAY_LABELS[(weekStartsOn + row) % 7] : ''}
                </th>
                {columns.map((column, columnIndex) => {
                  const cell = column[row]
                  if (!cell?.day) {
                    return (
                      <td key={columnIndex}>
                        <div aria-hidden="true" className="h-3.5 w-3.5" />
                      </td>
                    )
                  }

                  const day = cell.day
                  const isToday = day.date === today
                  const isSelected = selectedDate === day.date

                  return (
                    <td key={columnIndex} className="p-0">
                      <button
                        type="button"
                        ref={(node) => {
                          if (node) cellRefs.current.set(day.date, node)
                          else cellRefs.current.delete(day.date)
                        }}
                        onClick={() => onSelectDay(day.date)}
                        onKeyDown={(event) => handleKeyDown(event, day.date)}
                        aria-label={dayAriaLabel(day, levels)}
                        aria-pressed={isSelected}
                        title={dayTooltip(day, levels)}
                        className={cn(
                          'focus-visible:ring-ring h-3.5 w-3.5 rounded-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
                          intensityClass(day.intensity),
                          isToday && 'ring-foreground/60 ring-1',
                          isSelected && 'ring-foreground ring-2',
                        )}
                      />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <HeatmapLegend levels={levels} />
    </div>
  )
}

interface HeatmapLegendProps {
  levels: CalendarIntensityLevel[]
  className?: string
}

/** Explains the colour scale, using the thresholds the server actually applied. */
export function HeatmapLegend({ levels, className }: HeatmapLegendProps) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-xs', className)}>
      <span className="text-muted-foreground">Less</span>
      <div className="flex items-center gap-1">
        {levels.map((level) => (
          <span
            key={level.level}
            className={cn('h-3.5 w-3.5 rounded-sm', intensityClass(level.level))}
            aria-hidden="true"
          />
        ))}
      </div>
      <span className="text-muted-foreground">More</span>
      <span className="text-muted-foreground/80">·</span>
      <ul className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1">
        {levels.map((level) => (
          <li key={level.level} className="flex items-center gap-1.5">
            <span
              className={cn('h-2.5 w-2.5 rounded-sm', intensityClass(level.level))}
              aria-hidden="true"
            />
            {level.label}
          </li>
        ))}
      </ul>
    </div>
  )
}

interface HeatmapSummaryProps {
  totalMinutes: number
  activeDays: number
  qualifyingDays: number
  averageMinutesPerActiveDay: number
  bestDay: { date: string; totalMinutes: number } | null
  weekStartsOn: WeekStartsOn
  onToggleWeekStart: () => void
  className?: string
}

/** Compact range stats plus the week-start switch for the grid. */
export function HeatmapSummary({
  totalMinutes,
  activeDays,
  qualifyingDays,
  averageMinutesPerActiveDay,
  bestDay,
  weekStartsOn,
  onToggleWeekStart,
  className,
}: HeatmapSummaryProps) {
  const stats = [
    { label: 'Total studied', value: formatMinutes(totalMinutes) },
    { label: 'Active days', value: `${activeDays}` },
    { label: 'Streak days', value: `${qualifyingDays}` },
    { label: 'Avg / active day', value: formatMinutes(averageMinutesPerActiveDay) },
    { label: 'Best day', value: bestDay ? formatMinutes(bestDay.totalMinutes) : '—' },
  ]

  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-4', className)}>
      <dl className="flex flex-wrap gap-x-6 gap-y-2">
        {stats.map((stat) => (
          <div key={stat.label}>
            <dt className="text-muted-foreground text-xs">{stat.label}</dt>
            <dd className="text-lg font-semibold">{stat.value}</dd>
          </div>
        ))}
      </dl>

      <button
        type="button"
        onClick={onToggleWeekStart}
        className="text-muted-foreground hover:text-foreground border-warm-border rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
      >
        Weeks start on {weekStartsOn === 1 ? 'Monday' : 'Sunday'}
      </button>
    </div>
  )
}

/** Exported for the empty state so both views agree on the wording. */
export function describeEmptyRange(hasSessions: boolean): string {
  return hasSessions
    ? 'No study recorded in this range yet.'
    : 'Once you log a session it will show up here as a coloured day.'
}

/** Convenience helper used by the page for the day-cell tooltip in tests. */
export function cellTooltip(day: CalendarDay, levels: CalendarIntensityLevel[]): string {
  return dayTooltip(day, levels)
}
