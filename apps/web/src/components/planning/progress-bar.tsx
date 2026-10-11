'use client'

import { cn } from '@/lib/utils'

interface ProgressBarProps {
  value: number
  className?: string
  barClassName?: string
  label?: string
  showPercent?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export function ProgressBar({
  value,
  className,
  barClassName,
  label,
  showPercent = true,
  size = 'md',
}: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value))
  const heightClass = size === 'sm' ? 'h-2' : size === 'lg' ? 'h-5' : 'h-3'

  return (
    <div className={cn('w-full', className)}>
      {(label || showPercent) && (
        <div className="mb-1 flex items-center justify-between text-sm">
          {label && <span className="text-muted-foreground font-medium">{label}</span>}
          {showPercent && (
            <span className="text-muted-foreground tabular-nums">{Math.round(clamped)}%</span>
          )}
        </div>
      )}
      <div
        className={cn('bg-secondary w-full overflow-hidden rounded-full', heightClass)}
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? `${Math.round(clamped)}% progress`}
      >
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500 ease-out',
            clamped >= 100
              ? 'bg-green-500'
              : clamped >= 75
                ? 'bg-blue-500'
                : clamped >= 50
                  ? 'bg-primary'
                  : clamped >= 25
                    ? 'bg-yellow-500'
                    : 'bg-orange-500',
            barClassName,
          )}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  )
}
