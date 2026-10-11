'use client'

import { Clock, BookOpen } from 'lucide-react'
import { useTodayStats, formatDuration } from '@/lib/hooks/use-sessions'
import type { StudySessionItem } from '@/lib/hooks/use-sessions'
import { cn } from '@/lib/utils'

function SessionCard({ session }: { session: StudySessionItem }) {
  const startTime = new Date(session.startedAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className="flex items-start gap-4 rounded-lg border p-4">
      <div className="bg-primary/10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
        <BookOpen className="text-primary h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between">
          <p className="truncate font-medium">{session.skill.name}</p>
          <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-sm">
            <Clock className="h-3.5 w-3.5" />
            {formatDuration(session.durationMinutes)}
          </span>
        </div>
        <div className="text-muted-foreground mt-0.5 flex items-center gap-2 text-sm">
          <span>{startTime}</span>
          {session.category && (
            <>
              <span>·</span>
              <span>{session.category.name}</span>
            </>
          )}
          {session.topic && (
            <>
              <span>·</span>
              <span className="truncate">{session.topic}</span>
            </>
          )}
        </div>
        {session.selfRating && (
          <div className="mt-1 flex gap-0.5">
            {[1, 2, 3, 4, 5].map((star) => (
              <span
                key={star}
                className={cn(
                  'text-xs',
                  star <= session.selfRating! ? 'text-yellow-500' : 'text-gray-300 dark:text-gray-600',
                )}
              >
                ★
              </span>
            ))}
          </div>
        )}
        {session.isManual && (
          <span className="bg-secondary text-secondary-foreground mt-1 inline-block rounded px-1.5 py-0.5 text-xs">
            Manual
          </span>
        )}
      </div>
    </div>
  )
}

export function TodaySessions() {
  const { data, isLoading } = useTodayStats()

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="animate-pulse rounded-lg border p-4">
            <div className="bg-muted h-4 w-40 rounded" />
            <div className="bg-muted mt-2 h-3 w-24 rounded" />
          </div>
        ))}
      </div>
    )
  }

  const sessions = data?.sessions ?? []

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
        <BookOpen className="text-muted-foreground/40 h-10 w-10" strokeWidth={1.5} />
        <p className="text-muted-foreground mt-3 font-medium">No sessions today</p>
        <p className="text-muted-foreground/60 mt-1 text-sm">
          Start the timer or log a manual session.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {sessions.map((session) => (
        <SessionCard key={session.id} session={session} />
      ))}
    </div>
  )
}
