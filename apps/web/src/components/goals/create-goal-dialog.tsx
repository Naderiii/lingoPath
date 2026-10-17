'use client'

import { useState, useEffect } from 'react'
import { X, Plus, Trash2 } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useCreateGoal, type CreateGoalInput } from '@/lib/hooks/use-goals'
import { useActiveObjective, useObjectives } from '@/lib/hooks/use-objectives'
import { usePlans } from '@/lib/hooks/use-plans'
import { apiClient } from '@/lib/api-client'
import type { GoalPeriod } from '@lingopath/types'

interface Skill {
  id: string
  name: string
  sortOrder: number
}

interface CreateGoalDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Local calendar day of a Date (never the UTC day). */
function localDayKey(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(
    value.getDate(),
  ).padStart(2, '0')}`
}

export function CreateGoalDialog({ open, onOpenChange }: CreateGoalDialogProps) {
  const createGoal = useCreateGoal()
  const { data: plansData } = usePlans('ACTIVE')
  const activeQuery = useActiveObjective()
  const objectivesQuery = useObjectives()

  const [period, setPeriod] = useState<GoalPeriod>('WEEKLY')
  const [targetMinutes, setTargetMinutes] = useState(600) // 10 hours default
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [planId, setPlanId] = useState('')
  const [objectiveId, setObjectiveId] = useState('')
  const [skills, setSkills] = useState<Skill[]>([])
  const [skillTargets, setSkillTargets] = useState<{ skillId: string; targetMinutes: number }[]>([])
  const [error, setError] = useState<string | null>(null)

  // Fetch skills
  useEffect(() => {
    if (open) {
      apiClient
        .get<{ data: Skill[] }>('/api/v1/skills')
        .then((res) => setSkills(res.data.sort((a, b) => a.sortOrder - b.sortOrder)))
        .catch(() => setError('Failed to load skills'))
    }
  }, [open])

  // A new goal follows the active objective: that is how the current focus reaches
  // planning. The learner can still pick another one, or none.
  useEffect(() => {
    if (!open || activeQuery.isLoading) return
    setObjectiveId(activeQuery.data?.objective?.id ?? '')
  }, [open, activeQuery.isLoading, activeQuery.data?.objective?.id])

  // Auto-calculate dates based on period
  useEffect(() => {
    if (!open) return

    const now = new Date()
    let start: Date
    let end: Date

    switch (period) {
      case 'DAILY':
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        end = new Date(start)
        end.setHours(23, 59, 59, 999)
        break
      case 'WEEKLY':
        // Week starts on Monday
        const dayOfWeek = now.getDay()
        const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff)
        end = new Date(start)
        end.setDate(end.getDate() + 6)
        end.setHours(23, 59, 59, 999)
        break
      case 'MONTHLY':
        start = new Date(now.getFullYear(), now.getMonth(), 1)
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
        break
      case 'YEARLY':
        start = new Date(now.getFullYear(), 0, 1)
        end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999)
        break
    }

    setStartDate(localDayKey(start))
    setEndDate(localDayKey(end))
  }, [period, open])

  const handleAddSkillTarget = () => {
    const availableSkills = skills.filter((s) => !skillTargets.some((st) => st.skillId === s.id))
    if (availableSkills.length > 0) {
      setSkillTargets([...skillTargets, { skillId: availableSkills[0]!.id, targetMinutes: 0 }])
    }
  }

  const handleRemoveSkillTarget = (index: number) => {
    setSkillTargets(skillTargets.filter((_, i) => i !== index))
  }

  const handleSkillTargetChange = (
    index: number,
    field: 'skillId' | 'targetMinutes',
    value: string | number,
  ) => {
    const updated = [...skillTargets]
    if (field === 'skillId') {
      updated[index]!.skillId = value as string
    } else {
      updated[index]!.targetMinutes = Number(value)
    }
    setSkillTargets(updated)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    try {
      const data: CreateGoalInput = {
        period,
        targetMinutes,
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
        isActive: true,
        ...(planId ? { planId } : {}),
        ...(objectiveId ? { objectiveId } : {}),
        ...(skillTargets.length > 0 ? { skillTargets } : {}),
      }

      await createGoal.mutateAsync(data)
      onOpenChange(false)
      resetForm()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create goal')
    }
  }

  const resetForm = () => {
    setPeriod('WEEKLY')
    setTargetMinutes(600)
    setStartDate('')
    setEndDate('')
    setPlanId('')
    setObjectiveId('')
    setSkillTargets([])
    setError(null)
  }

  const targetHours = Math.floor(targetMinutes / 60)
  const targetMins = targetMinutes % 60

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <div className="bg-background fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="bg-background/80 fixed inset-0 backdrop-blur-sm"
          onClick={() => onOpenChange(false)}
        />
        <div className="bg-background border-border relative z-10 w-full max-w-2xl rounded-lg border shadow-lg">
          <div className="border-border flex items-center justify-between border-b px-6 py-4">
            <h2 className="text-foreground text-xl font-semibold">Create Goal</h2>
            <button
              onClick={() => onOpenChange(false)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="max-h-[calc(100vh-8rem)] overflow-y-auto p-6">
            {error && (
              <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-400">
                {error}
              </div>
            )}

            <div className="space-y-4">
              {/* Period */}
              <div>
                <label className="text-foreground mb-2 block text-sm font-medium">Period</label>
                <select
                  value={period}
                  onChange={(e) => setPeriod(e.target.value as GoalPeriod)}
                  className="border-input bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm"
                  required
                >
                  <option value="DAILY">Daily</option>
                  <option value="WEEKLY">Weekly</option>
                  <option value="MONTHLY">Monthly</option>
                  <option value="YEARLY">Yearly</option>
                </select>
              </div>

              {/* Target */}
              <div>
                <label className="text-foreground mb-2 block text-sm font-medium">
                  Target Study Time
                </label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <input
                      type="number"
                      min="0"
                      max="999"
                      value={targetHours}
                      onChange={(e) => setTargetMinutes(Number(e.target.value) * 60 + targetMins)}
                      className="border-input bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm"
                      placeholder="Hours"
                    />
                    <span className="text-muted-foreground mt-1 block text-xs">Hours</span>
                  </div>
                  <div className="flex-1">
                    <input
                      type="number"
                      min="0"
                      max="59"
                      value={targetMins}
                      onChange={(e) => setTargetMinutes(targetHours * 60 + Number(e.target.value))}
                      className="border-input bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm"
                      placeholder="Minutes"
                    />
                    <span className="text-muted-foreground mt-1 block text-xs">Minutes</span>
                  </div>
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-foreground mb-2 block text-sm font-medium">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="border-input bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="text-foreground mb-2 block text-sm font-medium">End Date</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="border-input bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm"
                    required
                  />
                </div>
              </div>

              {/* Objective — defaults to the active one */}
              {objectivesQuery.data && objectivesQuery.data.data.length > 0 && (
                <div>
                  <label className="text-foreground mb-2 block text-sm font-medium">
                    Objective (Optional)
                  </label>
                  <select
                    value={objectiveId}
                    onChange={(e) => setObjectiveId(e.target.value)}
                    className="border-input bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm"
                  >
                    <option value="">None</option>
                    {objectivesQuery.data.data
                      .filter((objective) => objective.isActive)
                      .map((objective) => (
                        <option key={objective.id} value={objective.id}>
                          {objective.title}
                          {objective.id === activeQuery.data?.objective?.id ? ' (active)' : ''}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              {/* Link to Plan */}
              {plansData && plansData.data.length > 0 && (
                <div>
                  <label className="text-foreground mb-2 block text-sm font-medium">
                    Link to Plan (Optional)
                  </label>
                  <select
                    value={planId}
                    onChange={(e) => setPlanId(e.target.value)}
                    className="border-input bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm"
                  >
                    <option value="">None</option>
                    {plansData.data.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Skill Targets */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-foreground text-sm font-medium">
                    Skill Distribution (Optional)
                  </label>
                  <button
                    type="button"
                    onClick={handleAddSkillTarget}
                    disabled={skillTargets.length >= skills.length}
                    className="text-primary hover:text-primary/80 flex items-center gap-1 text-sm font-medium disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" />
                    Add Skill
                  </button>
                </div>

                {skillTargets.length > 0 && (
                  <div className="space-y-2">
                    {skillTargets.map((target, index) => {
                      const hours = Math.floor(target.targetMinutes / 60)
                      const mins = target.targetMinutes % 60
                      return (
                        <div key={index} className="flex gap-2">
                          <select
                            value={target.skillId}
                            onChange={(e) =>
                              handleSkillTargetChange(index, 'skillId', e.target.value)
                            }
                            className="border-input bg-background text-foreground flex-1 rounded-md border px-3 py-2 text-sm"
                          >
                            {skills.map((skill) => (
                              <option
                                key={skill.id}
                                value={skill.id}
                                disabled={skillTargets.some(
                                  (st, i) => i !== index && st.skillId === skill.id,
                                )}
                              >
                                {skill.name}
                              </option>
                            ))}
                          </select>
                          <input
                            type="number"
                            min="0"
                            value={hours}
                            onChange={(e) =>
                              handleSkillTargetChange(
                                index,
                                'targetMinutes',
                                Number(e.target.value) * 60 + mins,
                              )
                            }
                            className="border-input bg-background text-foreground w-20 rounded-md border px-3 py-2 text-sm"
                            placeholder="h"
                          />
                          <input
                            type="number"
                            min="0"
                            max="59"
                            value={mins}
                            onChange={(e) =>
                              handleSkillTargetChange(
                                index,
                                'targetMinutes',
                                hours * 60 + Number(e.target.value),
                              )
                            }
                            className="border-input bg-background text-foreground w-20 rounded-md border px-3 py-2 text-sm"
                            placeholder="m"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveSkillTarget(index)}
                            className="text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <Trash2 className="h-5 w-5" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button
                type="button"
                onClick={() => onOpenChange(false)}
                variant="outline"
                disabled={createGoal.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createGoal.isPending}>
                {createGoal.isPending ? 'Creating...' : 'Create Goal'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </Dialog>
  )
}
