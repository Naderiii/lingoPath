import { Card, CardContent, CardHeader } from '@/components/ui/card'

export function DashboardLoading() {
  return (
    <div className="space-y-6">
      {/* Today card skeleton */}
      <Card>
        <CardHeader>
          <div className="h-6 w-24 bg-muted/30 rounded animate-pulse" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="h-4 w-20 bg-muted/30 rounded animate-pulse" />
              <div className="h-8 w-24 bg-muted/30 rounded animate-pulse" />
            </div>
            <div className="space-y-2">
              <div className="h-4 w-20 bg-muted/30 rounded animate-pulse" />
              <div className="h-8 w-24 bg-muted/30 rounded animate-pulse" />
            </div>
          </div>
          <div className="h-2 w-full bg-muted/30 rounded-full animate-pulse" />
        </CardContent>
      </Card>

      {/* Active plan skeleton */}
      <Card>
        <CardHeader>
          <div className="h-6 w-48 bg-muted/30 rounded animate-pulse" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="h-4 w-full bg-muted/30 rounded animate-pulse" />
          <div className="h-4 w-3/4 bg-muted/30 rounded animate-pulse" />
        </CardContent>
      </Card>

      {/* Grid skeleton */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="h-6 w-32 bg-muted/30 rounded animate-pulse" />
          </CardHeader>
          <CardContent>
            <div className="h-32 w-full bg-muted/30 rounded animate-pulse" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div className="h-6 w-32 bg-muted/30 rounded animate-pulse" />
          </CardHeader>
          <CardContent>
            <div className="h-32 w-full bg-muted/30 rounded animate-pulse" />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
