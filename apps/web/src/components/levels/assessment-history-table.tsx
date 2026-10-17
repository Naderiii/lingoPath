'use client'

import { useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import type { LevelAssessmentEntry, LevelDimension } from '@lingopath/types'
import { Button } from '@/components/ui/button'
import { LevelBadge } from './level-summary-cards'
import { dayKeyFromInstant, formatDayLabel } from '@/lib/calendar'
import { dimensionLabel, METHOD_LABELS } from '@/lib/levels'

interface AssessmentHistoryTableProps {
  history: LevelAssessmentEntry[]
  dimensions: LevelDimension[]
  hasMore: boolean
  total: number
  onEdit: (assessment: LevelAssessmentEntry) => void
  onDelete: (id: string) => void
  isDeleting?: boolean
}

/**
 * Every recorded assessment, newest first.
 *
 * Deleting asks for confirmation inline rather than in a dialog: the row itself is
 * the thing being removed, so the question appears where the action was taken.
 */
export function AssessmentHistoryTable({
  history,
  dimensions,
  hasMore,
  total,
  onEdit,
  onDelete,
  isDeleting = false,
}: AssessmentHistoryTableProps) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="text-muted-foreground mb-2 text-left text-sm">
            {total} recorded {total === 1 ? 'assessment' : 'assessments'}
            {hasMore ? ` · showing the most recent ${history.length}` : ''}
          </caption>
          <thead>
            <tr className="border-border border-b text-left">
              <th scope="col" className="px-3 py-2 font-medium">
                Date
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Method
              </th>
              {dimensions.map((dimension) => (
                <th key={dimension} scope="col" className="px-3 py-2 font-medium">
                  {dimensionLabel(dimension)}
                </th>
              ))}
              <th scope="col" className="px-3 py-2 font-medium">
                Notes
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {history.map((assessment) => (
              <tr key={assessment.id} className="border-border/60 border-b align-top">
                <td className="whitespace-nowrap px-3 py-3">
                  {formatDayLabel(dayKeyFromInstant(assessment.assessedAt))}
                </td>
                <td className="whitespace-nowrap px-3 py-3">
                  {METHOD_LABELS[assessment.method] ?? assessment.method}
                </td>
                {dimensions.map((dimension) => {
                  const level = assessment.levels[dimension]
                  return (
                    <td key={dimension} className="px-3 py-3">
                      {level === null ? (
                        <span className="text-muted-foreground">Not assessed</span>
                      ) : (
                        <LevelBadge level={level} />
                      )}
                    </td>
                  )
                })}
                <td className="text-muted-foreground max-w-[16rem] px-3 py-3">
                  {assessment.notes ?? '—'}
                </td>
                <td className="px-3 py-3">
                  {confirmingId === assessment.id ? (
                    <div className="flex flex-col items-end gap-2">
                      <span className="text-muted-foreground text-xs">Delete this assessment?</span>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => setConfirmingId(null)}>
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          disabled={isDeleting}
                          onClick={() => {
                            setConfirmingId(null)
                            onDelete(assessment.id)
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onEdit(assessment)}
                        aria-label={`Edit assessment from ${dayKeyFromInstant(assessment.assessedAt)}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setConfirmingId(assessment.id)}
                        aria-label={`Delete assessment from ${dayKeyFromInstant(assessment.assessedAt)}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
