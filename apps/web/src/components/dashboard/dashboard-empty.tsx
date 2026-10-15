import { BookOpen, Target, TrendingUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export function DashboardEmpty() {
  return (
    <div className="space-y-6">
      <Card className="border-primary/20 bg-accent-tint/20">
        <CardHeader>
          <CardTitle className="text-2xl font-bold">Welcome to LingoPath</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-muted-foreground">
            You have not recorded any study sessions yet. Start tracking your language learning
            journey to see your progress here.
          </p>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-3 p-4 bg-surface rounded-lg border border-warm-border">
              <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                <BookOpen className="h-5 w-5 text-primary" />
              </div>
              <div className="space-y-1">
                <h3 className="font-semibold">Start a Study Session</h3>
                <p className="text-sm text-muted-foreground">
                  Record your study time and track what you are learning.
                </p>
              </div>
              <Link href="/study">
                <Button variant="outline" size="sm" className="w-full">
                  Go to Study
                </Button>
              </Link>
            </div>

            <div className="space-y-3 p-4 bg-surface rounded-lg border border-warm-border">
              <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                <Target className="h-5 w-5 text-primary" />
              </div>
              <div className="space-y-1">
                <h3 className="font-semibold">Set Your Goals</h3>
                <p className="text-sm text-muted-foreground">
                  Define daily, weekly, or monthly targets to stay motivated.
                </p>
              </div>
              <Link href="/goals">
                <Button variant="outline" size="sm" className="w-full">
                  Set Goals
                </Button>
              </Link>
            </div>

            <div className="space-y-3 p-4 bg-surface rounded-lg border border-warm-border">
              <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
              <div className="space-y-1">
                <h3 className="font-semibold">Create a Plan</h3>
                <p className="text-sm text-muted-foreground">
                  Build a long-term study plan with milestones and objectives.
                </p>
              </div>
              <Link href="/planning">
                <Button variant="outline" size="sm" className="w-full">
                  Create Plan
                </Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
