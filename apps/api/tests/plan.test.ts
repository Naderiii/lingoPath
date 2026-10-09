import { describe, it, expect } from 'vitest'
import { createPlanService, computeRemainingDays } from '../src/modules/plans/plan.service.js'
import type { PlanRepository } from '../src/modules/plans/plan.repository.js'

describe('LongTermPlan business rules', () => {
  it('should compute remaining days correctly from future end date', () => {
    const futureDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
    const remaining = computeRemainingDays(futureDate)
    expect(remaining).toBe(5)
  })

  it('should return 0 remaining days for past end date', () => {
    const pastDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
    const remaining = computeRemainingDays(pastDate)
    expect(remaining).toBe(0)
  })

  it('should reject plan creation when endDate is before or equal to startDate', async () => {
    const mockRepo: Partial<PlanRepository> = {}
    const service = createPlanService(mockRepo as PlanRepository)

    await expect(
      service.createPlan('user-1', {
        title: 'IELTS Preparation Plan',
        startDate: '2026-10-10T00:00:00.000Z',
        endDate: '2026-10-09T00:00:00.000Z',
        targetMinutes: 1200,
        status: 'ACTIVE',
      }),
    ).rejects.toThrow('endDate must be strictly after startDate')
  })
})
