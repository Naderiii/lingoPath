import { describe, it, expect } from 'vitest'
import { createGoalService } from '../src/modules/goals/goal.service.js'
import type { GoalRepository } from '../src/modules/goals/goal.repository.js'

describe('Goal business rules', () => {
  it('should reject goal creation when endDate is before startDate', async () => {
    const mockRepo: Partial<GoalRepository> = {}
    const service = createGoalService(mockRepo as GoalRepository)

    await expect(
      service.createGoal('user-1', {
        period: 'DAILY',
        targetMinutes: 60,
        startDate: '2026-10-10T00:00:00.000Z',
        endDate: '2026-10-09T00:00:00.000Z',
        isActive: true,
      }),
    ).rejects.toThrow('endDate must be after startDate')
  })
})
