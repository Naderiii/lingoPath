'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { DashboardData } from '@/lib/hooks/use-dashboard'

interface SkillsCardProps {
  data: DashboardData['skills']
}

export function SkillsCard({ data }: SkillsCardProps) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-bold">Skills Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">
            No study sessions recorded in the last 30 days.
          </p>
        </CardContent>
      </Card>
    )
  }

  const colors = [
    'bg-primary',
    'bg-[#8B4513]',
    'bg-[#A0522D]',
    'bg-[#CD853F]',
    'bg-[#DEB887]',
    'bg-[#D2691E]',
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl font-bold">Skills Distribution</CardTitle>
        <p className="text-sm text-muted-foreground">Last 30 days</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Horizontal stacked bar */}
        <div className="h-8 flex rounded-full overflow-hidden">
          {data.map((skill, index) => (
            <div
              key={skill.skillId}
              className={`${colors[index % colors.length]} transition-all duration-300`}
              style={{ width: `${skill.percentage}%` }}
              title={`${skill.skillName}: ${skill.percentage}%`}
            />
          ))}
        </div>

        {/* Legend */}
        <div className="space-y-2">
          {data.map((skill, index) => (
            <div key={skill.skillId} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-4 h-4 rounded ${colors[index % colors.length]}`} />
                <span className="text-sm font-medium">{skill.skillName}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  {Math.floor(skill.totalMinutes / 60)}h {skill.totalMinutes % 60}m
                </span>
                <span className="text-sm font-semibold w-12 text-right">{skill.percentage}%</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
