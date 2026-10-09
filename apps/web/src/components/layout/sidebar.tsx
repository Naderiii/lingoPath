'use client'

import { GraduationCap, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { SidebarNav } from './sidebar-nav'

export function Sidebar() {
  const { theme, setTheme } = useTheme()

  return (
    <aside className="border-sidebar-border bg-sidebar flex h-full w-60 shrink-0 flex-col border-r">
      {/* Logo / Brand */}
      <div className="border-sidebar-border flex h-14 items-center gap-2 border-b px-4">
        <GraduationCap className="text-primary h-6 w-6" />
        <span className="font-semibold tracking-tight">LingoPath</span>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto">
        <SidebarNav />
      </div>

      {/* Footer: Theme Toggle */}
      <div className="border-sidebar-border border-t p-3">
        <Button
          variant="ghost"
          size="sm"
          className="text-sidebar-foreground/70 w-full justify-start gap-2"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </Button>
      </div>
    </aside>
  )
}
