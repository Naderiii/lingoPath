'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StudyTimer } from '@/components/study/study-timer'

export function TimerPageClient() {
  return (
    <div className="flex flex-col gap-6 max-w-xl mx-auto">
      <div className="flex items-center gap-3">
        <Link href="/study">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Study Timer</h2>
          <p className="text-muted-foreground mt-1">
            Focus on your studies with the persistent timer.
          </p>
        </div>
      </div>

      <StudyTimer />
    </div>
  )
}
