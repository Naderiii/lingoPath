import type { Metadata } from 'next'
import { HistoryPageClient } from './history-page-client'

export const metadata: Metadata = {
  title: 'Study History',
}

export default function HistoryPage() {
  return <HistoryPageClient />
}
