'use client'

import { usePathname } from 'next/navigation'
import { MobileNav } from './mobile-nav'

// Derive a human-readable page title from the pathname
function getPageTitle(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean)
  if (segments.length === 0) return 'Dashboard'
  const last = segments[segments.length - 1] ?? ''
  return last.charAt(0).toUpperCase() + last.slice(1).replace(/-/g, ' ')
}

export function TopBar() {
  const pathname = usePathname()

  return (
    <header className="border-border bg-background flex h-14 items-center gap-4 border-b px-4 md:px-6">
      <MobileNav />
      <h1 className="truncate text-base font-semibold">{getPageTitle(pathname)}</h1>
    </header>
  )
}
