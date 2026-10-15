import { AlertTriangle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface DashboardErrorProps {
  error: Error
  retry?: () => void
}

export function DashboardError({ error, retry }: DashboardErrorProps) {
  return (
    <Card className="border-destructive">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-5 w-5" />
          Error Loading Dashboard
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground">
          We encountered an error while loading your dashboard data.
        </p>
        <p className="text-sm text-muted-foreground font-mono bg-muted/30 p-3 rounded">
          {error.message}
        </p>
        {retry && (
          <Button onClick={retry} variant="outline">
            Try Again
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
