import type { Metadata } from 'next'
import { TimerPageClient } from './timer-page-client'

export const metadata: Metadata = {
  title: 'Study Timer',
}

export default function TimerPage() {
  return <TimerPageClient />
}
