import { AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface ErrorStateProps {
  className?: string
  title?: string
  message?: string
  onRetry?: () => void
}

export function ErrorState({
  className,
  title = 'Something went wrong',
  message = 'An unexpected error occurred. Please try again.',
  onRetry,
}: ErrorStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-4 py-16', className)}>
      <AlertCircle className="text-destructive h-10 w-10" />
      <div className="text-center">
        <p className="text-foreground font-semibold">{title}</p>
        <p className="text-muted-foreground mt-1 text-sm">{message}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}
