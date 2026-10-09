'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  BookOpen,
  Timer,
  History,
  CalendarDays,
  BarChart3,
  Target,
  TrendingUp,
  FileText,
  Settings,
  GraduationCap,
  ClipboardList,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface NavItem {
  label: string
  href: string
  icon: React.ElementType
  group?: string
}

const navItems: NavItem[] = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
    group: 'Overview',
  },
  {
    label: 'Study',
    href: '/study',
    icon: BookOpen,
    group: 'Study',
  },
  {
    label: 'Timer',
    href: '/study/timer',
    icon: Timer,
    group: 'Study',
  },
  {
    label: 'History',
    href: '/study/history',
    icon: History,
    group: 'Study',
  },
  {
    label: 'Planning',
    href: '/planning',
    icon: ClipboardList,
    group: 'Plan',
  },
  {
    label: 'Calendar',
    href: '/calendar',
    icon: CalendarDays,
    group: 'Plan',
  },
  {
    label: 'Goals',
    href: '/goals',
    icon: Target,
    group: 'Plan',
  },
  {
    label: 'Analytics',
    href: '/analytics',
    icon: BarChart3,
    group: 'Progress',
  },
  {
    label: 'Levels',
    href: '/levels',
    icon: TrendingUp,
    group: 'Progress',
  },
  {
    label: 'Exams',
    href: '/exams',
    icon: FileText,
    group: 'Progress',
  },
  {
    label: 'Settings',
    href: '/settings',
    icon: Settings,
    group: 'System',
  },
]

function groupNavItems(items: NavItem[]) {
  const groups: Record<string, NavItem[]> = {}
  for (const item of items) {
    const group = item.group ?? 'Other'
    if (!groups[group]) groups[group] = []
    groups[group]!.push(item)
  }
  return groups
}

interface SidebarNavProps {
  onNavigate?: () => void
}

export function SidebarNav({ onNavigate }: SidebarNavProps) {
  const pathname = usePathname()
  const groups = groupNavItems(navItems)

  return (
    <nav className="flex flex-col gap-1 px-2 py-4">
      {Object.entries(groups).map(([group, items], groupIndex) => (
        <div key={group} className={cn(groupIndex > 0 && 'mt-4')}>
          <p className="text-sidebar-foreground/40 mb-1 px-3 text-xs font-semibold uppercase tracking-wider">
            {group}
          </p>
          {items.map((item) => {
            const isActive = pathname === item.href
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
                )}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            )
          })}
        </div>
      ))}
    </nav>
  )
}
