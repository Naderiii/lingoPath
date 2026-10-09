import type { LucideIcon } from 'lucide-react'
import { Construction } from 'lucide-react'

interface PlaceholderPageProps {
  title: string
  description: string
  phase?: number
  icon?: LucideIcon
}

export function PlaceholderPage({
  title,
  description,
  phase = 2,
  icon: Icon = Construction,
}: PlaceholderPageProps) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
        <p className="text-muted-foreground mt-1">{description}</p>
      </div>
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-20 text-center">
        <Icon className="text-muted-foreground/40 h-12 w-12" strokeWidth={1.5} />
        <p className="text-muted-foreground mt-4 font-medium">Coming in Phase {phase}</p>
        <p className="text-muted-foreground/60 mt-1 text-sm">
          This section is planned and will be implemented in a future phase.
        </p>
      </div>
    </div>
  )
}
