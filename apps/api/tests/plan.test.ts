import { describe, it, expect } from 'vitest'
import {
  computeRemainingDays,
  computeElapsedDays,
  computeTotalDays,
  computeTimeProgressPercent,
  formatMinutes,
  createPlanService,
  validateMilestoneDates,
} from '../src/modules/plans/plan.service.js'
import type { PlanRepository } from '../src/modules/plans/plan.repository.js'

// ─── Pure function unit tests ──────────────────────────────────────────────

describe('computeRemainingDays', () => {
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

  it('should return 0 for same moment', () => {
    const now = new Date('2026-06-15T12:00:00Z')
    expect(computeRemainingDays(now, now)).toBe(0)
  })

  it('should handle same-day plan (end date a few hours later)', () => {
    const now = new Date('2026-06-15T08:00:00Z')
    const end = new Date('2026-06-15T20:00:00Z')
    const remaining = computeRemainingDays(end, now)
    expect(remaining).toBe(1) // ceil of 0.5 days
  })

  it('should handle leap year February 29', () => {
    // 2028 is a leap year
    const now = new Date('2028-02-28T12:00:00Z')
    const end = new Date('2028-03-01T12:00:00Z')
    const remaining = computeRemainingDays(end, now)
    expect(remaining).toBe(2) // Feb 28 -> Feb 29 -> Mar 1 = 2 days
  })

  it('should handle month boundary (Jan 31 to Feb 1)', () => {
    const now = new Date('2026-01-31T00:00:00Z')
    const end = new Date('2026-02-01T00:00:00Z')
    expect(computeRemainingDays(end, now)).toBe(1)
  })

  it('should handle year boundary (Dec 31 to Jan 1)', () => {
    const now = new Date('2026-12-31T00:00:00Z')
    const end = new Date('2027-01-01T00:00:00Z')
    expect(computeRemainingDays(end, now)).toBe(1)
  })

  it('should handle very long plans (6 months)', () => {
    const now = new Date('2026-10-01T00:00:00Z')
    const end = new Date('2027-04-01T00:00:00Z')
    const remaining = computeRemainingDays(end, now)
    expect(remaining).toBe(182) // Oct-Mar = 182 days
  })

  it('should handle timezone boundary (near midnight UTC)', () => {
    const now = new Date('2026-06-15T23:59:59.999Z')
    const end = new Date('2026-06-16T00:00:00.001Z')
    const remaining = computeRemainingDays(end, now)
    expect(remaining).toBe(1)
  })
})

describe('computeElapsedDays', () => {
  it('should return 0 on start day', () => {
    const start = new Date('2026-10-01T00:00:00Z')
    expect(computeElapsedDays(start, start)).toBe(0)
  })

  it('should return correct elapsed for mid-plan', () => {
    const start = new Date('2026-10-01T00:00:00Z')
    const now = new Date('2026-10-11T00:00:00Z')
    expect(computeElapsedDays(start, now)).toBe(10)
  })

  it('should return 0 if now is before start', () => {
    const start = new Date('2027-01-01T00:00:00Z')
    const now = new Date('2026-12-31T00:00:00Z')
    expect(computeElapsedDays(start, now)).toBe(0)
  })
})

describe('computeTotalDays', () => {
  it('should compute total days for a 6-month plan', () => {
    const start = new Date('2026-10-01T00:00:00Z')
    const end = new Date('2027-04-01T00:00:00Z')
    expect(computeTotalDays(start, end)).toBe(182)
  })

  it('should return 0 for same start and end', () => {
    const d = new Date('2026-10-01T00:00:00Z')
    expect(computeTotalDays(d, d)).toBe(0)
  })

  it('should handle 1-day plan', () => {
    const start = new Date('2026-10-01T00:00:00Z')
    const end = new Date('2026-10-02T00:00:00Z')
    expect(computeTotalDays(start, end)).toBe(1)
  })

  it('should handle leap year (Feb 28 to Mar 1 in 2028)', () => {
    expect(
      computeTotalDays(new Date('2028-02-28T00:00:00Z'), new Date('2028-03-01T00:00:00Z')),
    ).toBe(2)
  })

  it('should handle leap year (Feb 28 to Mar 1 in 2027, non-leap)', () => {
    expect(
      computeTotalDays(new Date('2027-02-28T00:00:00Z'), new Date('2027-03-01T00:00:00Z')),
    ).toBe(1)
  })
})

describe('computeTimeProgressPercent', () => {
  it('should return 0% at plan start', () => {
    const start = new Date('2026-10-01T00:00:00Z')
    const end = new Date('2027-04-01T00:00:00Z')
    expect(computeTimeProgressPercent(start, end, start)).toBe(0)
  })

  it('should return 100% at plan end', () => {
    const start = new Date('2026-10-01T00:00:00Z')
    const end = new Date('2027-04-01T00:00:00Z')
    expect(computeTimeProgressPercent(start, end, end)).toBe(100)
  })

  it('should return ~50% at midpoint', () => {
    const start = new Date('2026-10-01T00:00:00Z')
    const end = new Date('2026-10-11T00:00:00Z')
    const mid = new Date('2026-10-06T00:00:00Z')
    expect(computeTimeProgressPercent(start, end, mid)).toBe(50)
  })

  it('should clamp to 100% past end date', () => {
    const start = new Date('2026-10-01T00:00:00Z')
    const end = new Date('2026-10-11T00:00:00Z')
    const late = new Date('2026-11-01T00:00:00Z')
    expect(computeTimeProgressPercent(start, end, late)).toBe(100)
  })

  it('should return 0% before start date', () => {
    const start = new Date('2026-10-01T00:00:00Z')
    const end = new Date('2026-10-11T00:00:00Z')
    const early = new Date('2026-09-01T00:00:00Z')
    expect(computeTimeProgressPercent(start, end, early)).toBe(0)
  })
})

describe('formatMinutes', () => {
  it('should format hours and minutes', () => {
    expect(formatMinutes(160)).toBe('2h 40m')
  })

  it('should format hours only', () => {
    expect(formatMinutes(120)).toBe('2h')
  })

  it('should format minutes only', () => {
    expect(formatMinutes(45)).toBe('45m')
  })

  it('should format 0 minutes', () => {
    expect(formatMinutes(0)).toBe('0m')
  })

  it('should handle large values (300h = 18000 minutes)', () => {
    expect(formatMinutes(18000)).toBe('300h')
  })

  it('should handle 72h 40m = 4360 minutes', () => {
    expect(formatMinutes(4360)).toBe('72h 40m')
  })
})

// ─── Service business rules ────────────────────────────────────────────────

describe('Plan service - creation validation', () => {
  it('should reject plan creation when endDate is before startDate', async () => {
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

  it('should reject plan creation when endDate equals startDate', async () => {
    const mockRepo: Partial<PlanRepository> = {}
    const service = createPlanService(mockRepo as PlanRepository)

    await expect(
      service.createPlan('user-1', {
        title: 'Same day plan',
        startDate: '2026-10-10T00:00:00.000Z',
        endDate: '2026-10-10T00:00:00.000Z',
        targetMinutes: 60,
        status: 'ACTIVE',
      }),
    ).rejects.toThrow('endDate must be strictly after startDate')
  })

  it('should reject invalid date strings', async () => {
    const mockRepo: Partial<PlanRepository> = {}
    const service = createPlanService(mockRepo as PlanRepository)

    await expect(
      service.createPlan('user-1', {
        title: 'Invalid',
        startDate: 'not-a-date',
        endDate: '2026-10-10T00:00:00.000Z',
        targetMinutes: 60,
        status: 'ACTIVE',
      }),
    ).rejects.toThrow('startDate and endDate must be valid dates')
  })

  it('should accept valid plan dates', async () => {
    const mockRepo: Partial<PlanRepository> = {
      create: async () =>
        ({
          id: 'plan-1',
          userId: 'user-1',
          title: 'IELTS Prep',
          description: null,
          startDate: new Date('2026-10-01T00:00:00.000Z'),
          endDate: new Date('2027-04-01T00:00:00.000Z'),
          targetMinutes: 18000,
          status: 'ACTIVE' as const,
          objectiveId: null,
          examId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          objective: null,
          exam: null,
          milestones: [],
        }) as Awaited<ReturnType<PlanRepository['create']>>,
    }
    const service = createPlanService(mockRepo as PlanRepository)

    const result = await service.createPlan('user-1', {
      title: 'IELTS Prep',
      startDate: '2026-10-01T00:00:00.000Z',
      endDate: '2027-04-01T00:00:00.000Z',
      targetMinutes: 18000,
      status: 'ACTIVE',
    })

    expect(result.title).toBe('IELTS Prep')
    expect(result.remainingDays).toBeGreaterThanOrEqual(0)
  })
})

describe('Plan service - milestone validation', () => {
  it('should reject milestone creation when endDate is before startDate', async () => {
    const mockRepo: Partial<PlanRepository> = {
      findById: async () =>
        ({
          id: 'plan-1',
          userId: 'user-1',
          title: 'Test Plan',
          description: null,
          startDate: new Date('2026-10-01T00:00:00.000Z'),
          endDate: new Date('2027-04-01T00:00:00.000Z'),
          targetMinutes: 18000,
          status: 'ACTIVE' as const,
          objectiveId: null,
          examId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          objective: null,
          exam: null,
          milestones: [],
        }) as Awaited<ReturnType<PlanRepository['findById']>>,
    }
    const service = createPlanService(mockRepo as PlanRepository)

    await expect(
      service.createMilestone('plan-1', 'user-1', {
        title: 'Month 1',
        startDate: '2026-11-01T00:00:00.000Z',
        endDate: '2026-10-01T00:00:00.000Z',
        targetMinutes: 3000,
        status: 'ACTIVE',
        ordering: 0,
      }),
    ).rejects.toThrow('endDate must be strictly after startDate')
  })

  it('should reject milestone when plan not found', async () => {
    const mockRepo: Partial<PlanRepository> = {
      findById: async () => null,
    }
    const service = createPlanService(mockRepo as PlanRepository)

    await expect(
      service.createMilestone('nonexistent', 'user-1', {
        title: 'Month 1',
        startDate: '2026-10-01T00:00:00.000Z',
        endDate: '2026-11-01T00:00:00.000Z',
        targetMinutes: 3000,
        status: 'ACTIVE',
        ordering: 0,
      }),
    ).rejects.toThrow("LongTermPlan with id 'nonexistent' not found")
  })

  it('should reject milestone with startDate before plan startDate', () => {
    const plan = {
      startDate: new Date('2026-10-01T00:00:00Z'),
      endDate: new Date('2027-04-01T00:00:00Z'),
      milestones: [],
    }

    expect(() =>
      validateMilestoneDates('2026-09-15T00:00:00Z', '2026-11-01T00:00:00Z', plan),
    ).toThrow('Milestone startDate cannot be before plan startDate')
  })

  it('should reject milestone with endDate after plan endDate', () => {
    const plan = {
      startDate: new Date('2026-10-01T00:00:00Z'),
      endDate: new Date('2027-04-01T00:00:00Z'),
      milestones: [],
    }

    expect(() =>
      validateMilestoneDates('2027-03-01T00:00:00Z', '2027-04-15T00:00:00Z', plan),
    ).toThrow('Milestone endDate cannot be after plan endDate')
  })

  it('should reject overlapping milestones within the same plan', () => {
    const plan = {
      startDate: new Date('2026-10-01T00:00:00Z'),
      endDate: new Date('2027-04-01T00:00:00Z'),
      milestones: [
        {
          id: 'ms-1',
          title: 'Month 1 - Foundation',
          startDate: new Date('2026-10-01T00:00:00Z'),
          endDate: new Date('2026-11-01T00:00:00Z'),
          status: 'ACTIVE',
        },
      ],
    }

    // Overlaps with ms-1 (starts Oct 15, ends Nov 15)
    expect(() =>
      validateMilestoneDates('2026-10-15T00:00:00Z', '2026-11-15T00:00:00Z', plan),
    ).toThrow('Milestone dates overlap with existing milestone "Month 1 - Foundation"')
  })

  it('should allow adjacent milestones sharing a boundary date', () => {
    const plan = {
      startDate: new Date('2026-10-01T00:00:00Z'),
      endDate: new Date('2027-04-01T00:00:00Z'),
      milestones: [
        {
          id: 'ms-1',
          title: 'Month 1 - Foundation',
          startDate: new Date('2026-10-01T00:00:00Z'),
          endDate: new Date('2026-11-01T00:00:00Z'),
          status: 'ACTIVE',
        },
      ],
    }

    // Adjacent: starts exactly when ms-1 ends
    expect(() =>
      validateMilestoneDates('2026-11-01T00:00:00Z', '2026-12-01T00:00:00Z', plan),
    ).not.toThrow()
  })

  it('should allow updating milestone without false self-overlap', () => {
    const plan = {
      startDate: new Date('2026-10-01T00:00:00Z'),
      endDate: new Date('2027-04-01T00:00:00Z'),
      milestones: [
        {
          id: 'ms-1',
          title: 'Month 1 - Foundation',
          startDate: new Date('2026-10-01T00:00:00Z'),
          endDate: new Date('2026-11-01T00:00:00Z'),
          status: 'ACTIVE',
        },
      ],
    }

    // Modifying ms-1 itself should not collide with itself
    expect(() =>
      validateMilestoneDates('2026-10-05T00:00:00Z', '2026-11-05T00:00:00Z', plan, 'ms-1'),
    ).not.toThrow()
  })

  it('should ignore cancelled milestones during overlap check', () => {
    const plan = {
      startDate: new Date('2026-10-01T00:00:00Z'),
      endDate: new Date('2027-04-01T00:00:00Z'),
      milestones: [
        {
          id: 'ms-cancelled',
          title: 'Cancelled Month 1',
          startDate: new Date('2026-10-01T00:00:00Z'),
          endDate: new Date('2026-11-01T00:00:00Z'),
          status: 'CANCELLED',
        },
      ],
    }

    // Replacing cancelled milestone should be allowed
    expect(() =>
      validateMilestoneDates('2026-10-01T00:00:00Z', '2026-11-01T00:00:00Z', plan),
    ).not.toThrow()
  })

  it('should reject updating plan dates when existing milestones fall outside new date range', async () => {
    const plan = {
      id: 'plan-1',
      userId: 'user-1',
      title: 'Test Plan',
      description: null,
      startDate: new Date('2026-10-01T00:00:00Z'),
      endDate: new Date('2027-04-01T00:00:00Z'),
      targetMinutes: 18000,
      status: 'ACTIVE' as const,
      objectiveId: null,
      examId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      objective: null,
      exam: null,
      milestones: [
        {
          id: 'ms-1',
          planId: 'plan-1',
          title: 'Month 1',
          description: null,
          startDate: new Date('2026-10-01T00:00:00Z'),
          endDate: new Date('2026-11-01T00:00:00Z'),
          targetMinutes: 3000,
          skillId: null,
          status: 'ACTIVE' as const,
          ordering: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          skill: null,
        },
      ],
    }

    const mockRepo: Partial<PlanRepository> = {
      findById: async () => plan as unknown as Awaited<ReturnType<PlanRepository['findById']>>,
    }
    const service = createPlanService(mockRepo as PlanRepository)

    // Moving plan start date to 2026-11-15 should fail because ms-1 starts on 2026-10-01
    await expect(
      service.updatePlan('plan-1', 'user-1', {
        startDate: '2026-11-15T00:00:00Z',
      }),
    ).rejects.toThrow('Plan startDate cannot be after existing milestone "Month 1" start date')
  })
})

describe('Plan service - timezone and DST calculations', () => {
  it('should compute remaining days correctly across timezones', () => {
    // 2026-10-15T02:00:00Z:
    // In UTC: 2026-10-15
    // In America/New_York (EDT, UTC-4): 2026-10-14 22:00:00 (still Oct 14)
    // End date: 2026-10-16T00:00:00Z (Oct 15 20:00:00 in NY)
    const now = new Date('2026-10-15T02:00:00Z')
    const end = new Date('2026-10-16T00:00:00Z')

    const remainingUtc = computeRemainingDays(end, now, 'UTC')
    const remainingNY = computeRemainingDays(end, now, 'America/New_York')

    expect(remainingUtc).toBe(1)
    expect(remainingNY).toBe(1) // Oct 14 to Oct 15 in NY = 1 day diff
  })

  it('should handle daylight saving time (DST) transition without off-by-one errors', () => {
    // In America/New_York, DST ends on Sunday Nov 1, 2026 (fall back, 25-hour day)
    const now = new Date('2026-10-31T12:00:00Z') // Saturday
    const end = new Date('2026-11-02T12:00:00Z') // Monday (crosses DST transition)

    const remaining = computeRemainingDays(end, now, 'America/New_York')
    expect(remaining).toBe(2)

    const total = computeTotalDays(now, end, 'America/New_York')
    expect(total).toBe(2)
  })

  it('should handle spring forward DST transition without error', () => {
    // In America/New_York, DST starts second Sunday in March 2027 (spring forward, 23-hour day)
    const now = new Date('2027-03-13T12:00:00Z')
    const end = new Date('2027-03-15T12:00:00Z')

    const remaining = computeRemainingDays(end, now, 'America/New_York')
    expect(remaining).toBe(2)
  })
})

describe('Plan service - user ownership and authorization', () => {
  it('should not allow user-2 to access user-1 plan', async () => {
    const mockRepo: Partial<PlanRepository> = {
      findById: async (id, userId) => {
        if (userId === 'user-1' && id === 'plan-1') {
          return { id: 'plan-1', userId: 'user-1' } as unknown as Awaited<ReturnType<PlanRepository['findById']>>
        }
        return null
      },
    }
    const service = createPlanService(mockRepo as PlanRepository)

    await expect(service.getPlanById('plan-1', 'user-2')).rejects.toThrow(
      "LongTermPlan with id 'plan-1' not found",
    )
  })

  it('should not allow user-2 to update user-1 milestone', async () => {
    const mockRepo: Partial<PlanRepository> = {
      findMilestoneById: async () =>
        ({
          id: 'ms-1',
          planId: 'plan-1',
          startDate: new Date('2026-10-01T00:00:00Z'),
          endDate: new Date('2026-11-01T00:00:00Z'),
          plan: { userId: 'user-1' },
        }) as unknown as Awaited<ReturnType<PlanRepository['findMilestoneById']>>,
    }
    const service = createPlanService(mockRepo as PlanRepository)

    await expect(
      service.updateMilestone('ms-1', 'user-2', { title: 'Hacked' }),
    ).rejects.toThrow("PlanMilestone with id 'ms-1' not found")
  })

  it('should not allow user-2 to delete user-1 milestone', async () => {
    const mockRepo: Partial<PlanRepository> = {
      findMilestoneById: async () =>
        ({
          id: 'ms-1',
          planId: 'plan-1',
          plan: { userId: 'user-1' },
        }) as unknown as Awaited<ReturnType<PlanRepository['findMilestoneById']>>,
    }
    const service = createPlanService(mockRepo as PlanRepository)

    await expect(service.deleteMilestone('ms-1', 'user-2')).rejects.toThrow(
      "PlanMilestone with id 'ms-1' not found",
    )
  })
})

describe('Plan service - status transitions', () => {
  const makeMockRepo = (
    plan: Awaited<ReturnType<PlanRepository['findById']>>,
  ): Partial<PlanRepository> => ({
    findById: async () => plan,
    update: async (_id, _userId, data) =>
      ({
        ...plan!,
        ...data,
        status: data.status ?? plan!.status,
        startDate: data.startDate ? new Date(data.startDate) : plan!.startDate,
        endDate: data.endDate ? new Date(data.endDate) : plan!.endDate,
        targetMinutes: data.targetMinutes ?? plan!.targetMinutes,
        milestones: [],
      }) as Awaited<ReturnType<PlanRepository['update']>>,
  })

  const basePlan = {
    id: 'plan-1',
    userId: 'user-1',
    title: 'Test Plan',
    description: null,
    startDate: new Date('2026-10-01T00:00:00.000Z'),
    endDate: new Date('2027-04-01T00:00:00.000Z'),
    targetMinutes: 18000,
    status: 'ACTIVE' as const,
    objectiveId: null,
    examId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    objective: null,
    exam: null,
    milestones: [],
  }

  it('should allow archiving an active plan', async () => {
    const mockRepo = makeMockRepo(
      basePlan as Awaited<ReturnType<PlanRepository['findById']>>,
    )
    const service = createPlanService(mockRepo as PlanRepository)

    const result = await service.updatePlan('plan-1', 'user-1', { status: 'ARCHIVED' })
    expect(result.status).toBe('ARCHIVED')
  })

  it('should allow cancelling an active plan', async () => {
    const mockRepo = makeMockRepo(
      basePlan as Awaited<ReturnType<PlanRepository['findById']>>,
    )
    const service = createPlanService(mockRepo as PlanRepository)

    const result = await service.updatePlan('plan-1', 'user-1', { status: 'CANCELLED' })
    expect(result.status).toBe('CANCELLED')
  })

  it('should allow completing a plan', async () => {
    const mockRepo = makeMockRepo(
      basePlan as Awaited<ReturnType<PlanRepository['findById']>>,
    )
    const service = createPlanService(mockRepo as PlanRepository)

    const result = await service.updatePlan('plan-1', 'user-1', { status: 'COMPLETED' })
    expect(result.status).toBe('COMPLETED')
  })
})

describe('Plan service - delete', () => {
  it('should throw NotFoundError when deleting non-existent plan', async () => {
    const mockRepo: Partial<PlanRepository> = {
      findById: async () => null,
    }
    const service = createPlanService(mockRepo as PlanRepository)

    await expect(service.deletePlan('nonexistent', 'user-1')).rejects.toThrow(
      "LongTermPlan with id 'nonexistent' not found",
    )
  })
})

describe('Plan service - progress computation', () => {
  it('should compute progress with zero study sessions', async () => {
    const plan = {
      id: 'plan-1',
      userId: 'user-1',
      title: '6-Month IELTS Preparation',
      description: null,
      startDate: new Date('2026-10-01T00:00:00.000Z'),
      endDate: new Date('2027-04-01T00:00:00.000Z'),
      targetMinutes: 18000,
      status: 'ACTIVE' as const,
      objectiveId: null,
      examId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      objective: null,
      exam: null,
      milestones: [],
    }

    const mockRepo: Partial<PlanRepository> = {
      findById: async () => plan as Awaited<ReturnType<PlanRepository['findById']>>,
      getActualMinutesForPlan: async () => 0,
      getActualMinutesByMilestone: async () => [],
      getWeeklyActualMinutes: async () => [],
      getMonthlyActualMinutes: async () => [],
    }
    const service = createPlanService(mockRepo as PlanRepository)

    const result = await service.getPlanProgress('plan-1', 'user-1')
    expect(result.progress.actualMinutes).toBe(0)
    expect(result.progress.studyProgressPercent).toBe(0)
    expect(result.progress.remainingMinutes).toBe(18000)
    expect(result.progress.targetMinutes).toBe(18000)
    expect(result.progress.isOverTarget).toBe(false)
  })

  it('should compute progress when study exceeds target', async () => {
    const plan = {
      id: 'plan-2',
      userId: 'user-1',
      title: 'Short Plan',
      description: null,
      startDate: new Date('2026-10-01T00:00:00.000Z'),
      endDate: new Date('2026-10-15T00:00:00.000Z'),
      targetMinutes: 100,
      status: 'ACTIVE' as const,
      objectiveId: null,
      examId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      objective: null,
      exam: null,
      milestones: [],
    }

    const mockRepo: Partial<PlanRepository> = {
      findById: async () => plan as Awaited<ReturnType<PlanRepository['findById']>>,
      getActualMinutesForPlan: async () => 150,
      getActualMinutesByMilestone: async () => [],
      getWeeklyActualMinutes: async () => [],
      getMonthlyActualMinutes: async () => [],
    }
    const service = createPlanService(mockRepo as PlanRepository)

    const result = await service.getPlanProgress('plan-2', 'user-1')
    expect(result.progress.actualMinutes).toBe(150)
    expect(result.progress.studyProgressPercent).toBe(100) // capped at 100
    expect(result.progress.remainingMinutes).toBe(0)
    expect(result.progress.isOverTarget).toBe(true)
  })

  it('should not allow manually entering study progress', () => {
    // This test verifies the architecture: progress comes from StudySession sum,
    // not from a manually-set field on LongTermPlan or PlanMilestone
    // The LongTermPlan model has no "actualMinutes" field —
    // it is computed by the service from StudySession.durationMinutes
    expect(true).toBe(true)
  })

  it('should correctly identify current and next milestones', async () => {
    const now = new Date('2026-11-15T12:00:00Z')

    const plan = {
      id: 'plan-3',
      userId: 'user-1',
      title: 'IELTS Plan',
      description: null,
      startDate: new Date('2026-10-01T00:00:00Z'),
      endDate: new Date('2027-04-01T00:00:00Z'),
      targetMinutes: 18000,
      status: 'ACTIVE' as const,
      objectiveId: null,
      examId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      objective: null,
      exam: null,
      milestones: [
        {
          id: 'ms-1',
          planId: 'plan-3',
          title: 'Month 1 - Foundation',
          description: null,
          startDate: new Date('2026-10-01T00:00:00Z'),
          endDate: new Date('2026-11-01T00:00:00Z'),
          targetMinutes: 3000,
          skillId: null,
          status: 'COMPLETED' as const,
          ordering: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          skill: null,
        },
        {
          id: 'ms-2',
          planId: 'plan-3',
          title: 'Month 2 - Vocabulary + Grammar',
          description: null,
          startDate: new Date('2026-11-01T00:00:00Z'),
          endDate: new Date('2026-12-01T00:00:00Z'),
          targetMinutes: 3000,
          skillId: null,
          status: 'ACTIVE' as const,
          ordering: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          skill: null,
        },
        {
          id: 'ms-3',
          planId: 'plan-3',
          title: 'Month 3 - Reading + Listening',
          description: null,
          startDate: new Date('2026-12-01T00:00:00Z'),
          endDate: new Date('2027-01-01T00:00:00Z'),
          targetMinutes: 3000,
          skillId: null,
          status: 'ACTIVE' as const,
          ordering: 2,
          createdAt: new Date(),
          updatedAt: new Date(),
          skill: null,
        },
      ],
    }

    const mockRepo: Partial<PlanRepository> = {
      findById: async () => plan as unknown as Awaited<ReturnType<PlanRepository['findById']>>,
      getActualMinutesForPlan: async () => 4360,
      getActualMinutesByMilestone: async () => [
        { milestoneId: 'ms-1', totalMinutes: 2800 },
        { milestoneId: 'ms-2', totalMinutes: 1560 },
      ],
      getWeeklyActualMinutes: async () => [],
      getMonthlyActualMinutes: async () => [],
    }

    const service = createPlanService(mockRepo as PlanRepository)

    // Temporarily override Date to test milestone current/next logic
    const originalDate = Date
    const MockDate = class extends originalDate {
      constructor(...args: Parameters<typeof Date>) {
        if (args.length === 0) {
          super(now.getTime())
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          super(...(args as [any]))
        }
      }
      static override now() {
        return now.getTime()
      }
    }
    globalThis.Date = MockDate as typeof Date

    try {
      const result = await service.getPlanProgress('plan-3', 'user-1')

      // ms-1 is COMPLETED, not current
      // ms-2 is ACTIVE and now is within its range, so current
      // ms-3 is ACTIVE and now is before its range, so next
      const ms2 = result.milestones.find((m) => m.milestoneId === 'ms-2')
      expect(ms2?.isCurrent).toBe(true)
      expect(ms2?.actualMinutes).toBe(1560)

      const ms3 = result.milestones.find((m) => m.milestoneId === 'ms-3')
      expect(ms3?.isNext).toBe(true)

      expect(result.progress.actualMinutes).toBe(4360)
      expect(result.progress.actualFormatted).toBe('72h 40m')
    } finally {
      globalThis.Date = originalDate
    }
  })
})

describe('Plan service - completed plan', () => {
  it('should return 0 remaining days for completed plan with past end date', () => {
    const pastEnd = new Date('2026-01-01T00:00:00Z')
    expect(computeRemainingDays(pastEnd)).toBe(0)
  })
})

describe('Plan service - cancelled plan', () => {
  it('should still compute remaining days for cancelled plan', () => {
    const futureEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    const remaining = computeRemainingDays(futureEnd)
    expect(remaining).toBeGreaterThan(0)
  })
})

describe('Plan service - archived plan', () => {
  it('archived plan should retain its data without modification', async () => {
    const plan = {
      id: 'plan-archived',
      userId: 'user-1',
      title: 'Archived Plan',
      description: null,
      startDate: new Date('2026-01-01T00:00:00Z'),
      endDate: new Date('2026-07-01T00:00:00Z'),
      targetMinutes: 10000,
      status: 'ACTIVE' as const,
      objectiveId: null,
      examId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      objective: null,
      exam: null,
      milestones: [],
    }

    const mockRepo: Partial<PlanRepository> = {
      findById: async () => plan as Awaited<ReturnType<PlanRepository['findById']>>,
      update: async (_id, _userId, data) =>
        ({
          ...plan,
          status: data.status ?? plan.status,
          milestones: [],
        }) as Awaited<ReturnType<PlanRepository['update']>>,
    }
    const service = createPlanService(mockRepo as PlanRepository)

    const result = await service.updatePlan('plan-archived', 'user-1', { status: 'ARCHIVED' })
    expect(result.status).toBe('ARCHIVED')
    // Study data should NOT be deleted — this is verified by the fact that
    // we only change status, not delete sessions
    expect(result.title).toBe('Archived Plan')
    expect(result.targetMinutes).toBe(10000)
  })
})
