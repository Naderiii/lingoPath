'use client'

import { ArrowDown, ArrowRight, ArrowUp } from 'lucide-react'
import type { AnalyticsSkill } from '@lingopath/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/shared/empty-state'
import { SkillBarChart } from '@/components/analytics/trend-chart'
import { describeDelta, formatMinutes } from '@/lib/analytics'
import { cn } from '@/lib/utils'

interface SkillBreakdownProps {
  skills: AnalyticsSkill[]
  className?: string
}

function TrendBadge({ skill }: { skill: AnalyticsSkill }) {
  const { trend } = skill
  const Icon =
    trend.direction === 'up' ? ArrowUp : trend.direction === 'down' ? ArrowDown : ArrowRight
  const label = describeDelta(trend)

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums',
        trend.direction === 'up' &&
          'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
        trend.direction === 'down' &&
          'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
        trend.direction === 'flat' && 'bg-accent-tint text-muted-foreground',
      )}
      title={
        trend.zeroBaseline
          ? 'No study time for this skill in the comparison window'
          : `${formatMinutes(trend.previousMinutes)} in the comparison window`
      }
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  )
}

/**
 * Per-skill analytics: total time, share of the window, session count, average
 * session length and the trend against the comparison window.
 */
export function SkillBreakdown({ skills, className }: SkillBreakdownProps) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Skill breakdown</CardTitle>
        <p className="text-muted-foreground text-sm">
          Time distribution and recent trend for each skill you studied in this range
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {skills.length === 0 ? (
          <EmptyState
            title="No skills recorded in this range"
            description="Sessions carry the skill you selected when logging them."
          />
        ) : (
          <>
            <SkillBarChart skills={skills} />

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Study time per skill in the selected range</caption>
                <thead>
                  <tr className="text-muted-foreground border-warm-border border-b text-left text-xs uppercase tracking-wide">
                    <th scope="col" className="py-2 pr-3 font-medium">
                      Skill
                    </th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">
                      Time
                    </th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">
                      Share
                    </th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">
                      Sessions
                    </th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">
                      Avg session
                    </th>
                    <th scope="col" className="py-2 text-right font-medium">
                      Trend
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {skills.map((skill) => (
                    <tr
                      key={skill.skillId}
                      className="border-warm-border/60 border-b last:border-0"
                    >
                      <th scope="row" className="py-2 pr-3 text-left font-medium">
                        {skill.name}
                      </th>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {formatMinutes(skill.totalMinutes)}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{skill.percentage}%</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{skill.sessions}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {formatMinutes(skill.averageSessionMinutes)}
                      </td>
                      <td className="py-2 text-right">
                        <TrendBadge skill={skill} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
