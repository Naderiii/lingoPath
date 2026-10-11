'use client'

import Link from 'next/link'
import { History } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TodayStats } from '@/components/study/today-stats'
import { StudyTimer } from '@/components/study/study-timer'
import { TodaySessions } from '@/components/study/today-sessions'
import { QuickAddSession } from '@/components/study/quick-add-session'
import { useQueryClient } from '@tanstack/react-query'
import { sessionKeys } from '@/lib/hooks/use-sessions'

export function StudyPageClient() {
  const queryClient = useQueryClient()

  const handleSessionCreated = () => {
    void queryClient.invalidateQueries({ queryKey: sessionKeys.all })
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Study</h2>
          <p className="text-muted-foreground mt-1">
            Track your study sessions, start the timer, or log manually.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <QuickAddSession onSuccess={handleSessionCreated} />
          <Link href="/study/history">
            <Button variant="outline" className="gap-2">
              <History className="h-4 w-4" />
              History
            </Button>
          </Link>
        </div>
      </div>

      {/* Today's Stats */}
      <TodayStats />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Timer */}
        <StudyTimer onSessionCreated={handleSessionCreated} />

        {/* Today's Sessions */}
        <div>
          <h3 className="mb-4 text-lg font-semibold">Today&apos;s Sessions</h3>
          <TodaySessions />
        </div>
      </div>
    </div>
  )
}
