import { describe, it, expect, vi } from 'vitest'
import type { Mock } from 'vitest'
import { buildObjectiveSignals } from '../src/modules/objectives/objective.signals.js'
import type { ObjectiveSignalInput } from '../src/modules/objectives/objective.signals.js'
import { createObjectiveService } from '../src/modules/objectives/objective.service.js'
import type { ObjectiveRepository } from '../src/modules/objectives/objective.repository.js'
import { diffDayKeys, getDayKey } from '../src/shared/timezone.js'

const TIMEZONE = 'Europe/Berlin'

function baseInput(overrides: Partial<ObjectiveSignalInput> = {}): ObjectiveSignalInput {
  return {
    objective: {
      title: 'IELTS Band 7.5 by spring',
      type: 'IELTS',
      targetScore: 7.5,
      targetDate: '2026-11-01',
    },
    hasAnyObjective: true,
    today: '2026-10-16',
    daysUntilTargetDate: 16,
    linkedPlanCount: 1,
    linkedGoalCount: 2,
    linkedExams: [],
    latestRecordedResult: null,
    hasAnyAssessment: true,
    ...overrides,
  }
}

describe('active objective signals', () => {
  it('asks for an objective when none exists, and distinguishes "none chosen"', () => {
    const created = buildObjectiveSignals(baseInput({ objective: null, hasAnyObjective: false }))
    expect(created.map((signal) => signal.id)).toEqual(['no-objectives'])

    const chosen = buildObjectiveSignals(baseInput({ objective: null, hasAnyObjective: true }))
    expect(chosen.map((signal) => signal.id)).toEqual(['no-active-objective'])
    expect(chosen[0]?.kind).toBe('OBJECTIVE')
  })

  it('names a missing target date as a gap instead of guessing one', () => {
    const signals = buildObjectiveSignals(
      baseInput({
        objective: {
          title: 'General English',
          type: 'GENERAL_ENGLISH',
          targetScore: null,
          targetDate: null,
        },
        daysUntilTargetDate: null,
      }),
    )

    const signal = signals.find((entry) => entry.id === 'target-date-missing')
    expect(signal?.kind).toBe('DATA_GAP')
    expect(signal?.basedOn).toBe('The active objective has no target date.')
  })

  it('reports a passed target date with both dates, and an upcoming one with the count', () => {
    const passed = buildObjectiveSignals(
      baseInput({
        objective: {
          title: 'IELTS Band 7.5 by spring',
          type: 'IELTS',
          targetScore: 7.5,
          targetDate: '2026-09-01',
        },
        daysUntilTargetDate: -45,
        today: '2026-10-16',
      }),
    ).find((entry) => entry.id === 'target-date-passed')

    expect(passed?.detail).toContain('2026-09-01')
    expect(passed?.detail).toContain('2026-10-16')

    const soon = buildObjectiveSignals(
      baseInput({
        objective: {
          title: 'IELTS Band 7.5 by spring',
          type: 'IELTS',
          targetScore: 7.5,
          targetDate: '2026-10-17',
        },
        daysUntilTargetDate: 1,
      }),
    ).find((entry) => entry.id === 'target-date-soon')

    expect(soon?.title).toBe('1 day until your target date')

    const later = buildObjectiveSignals(
      baseInput({
        objective: {
          title: 'IELTS Band 7.5 by spring',
          type: 'IELTS',
          targetScore: 7.5,
          targetDate: '2027-06-01',
        },
        daysUntilTargetDate: 228,
      }),
    )
    expect(later.map((signal) => signal.id)).not.toContain('target-date-soon')
  })

  it('points out a missing plan, a missing exam and a missing result', () => {
    const noPlan = buildObjectiveSignals(baseInput({ linkedPlanCount: 0 }))
    expect(noPlan.map((signal) => signal.id)).toContain('no-linked-plan')

    const noExam = buildObjectiveSignals(baseInput({ linkedExams: [] }))
    expect(noExam.map((signal) => signal.id)).toContain('no-linked-exam')

    const noResult = buildObjectiveSignals(
      baseInput({ linkedExams: [{ id: 'e1', title: 'IELTS Academic', status: 'PLANNED', targetScore: 7.5 }] }),
    )
    expect(noResult.map((signal) => signal.id)).toContain('no-recorded-result')
  })

  it('reports the target and the latest recorded result side by side', () => {
    const signals = buildObjectiveSignals(
      baseInput({
        linkedExams: [{ id: 'e1', title: 'IELTS Academic', status: 'COMPLETED', targetScore: 7.5 }],
        latestRecordedResult: {
          examId: 'e1',
          examTitle: 'IELTS Academic',
          takenOn: '2026-09-20',
          isMock: true,
          overallScore: 6.5,
        },
      }),
    )

    const signal = signals.find((entry) => entry.id === 'target-vs-recorded')
    expect(signal?.kind).toBe('RECORDED_SCORE')
    expect(signal?.detail).toContain('7.5')
    expect(signal?.detail).toContain('6.5')
    expect(signal?.detail).toContain('2026-09-20')
    expect(signal?.basedOn).toContain('readiness verdict')
  })

  it('stays silent about a target when the latest result belongs to an exam without one', () => {
    const signals = buildObjectiveSignals(
      baseInput({
        linkedExams: [
          { id: 'e1', title: 'IELTS Academic', status: 'PLANNED', targetScore: 7.5 },
          { id: 'e2', title: 'Practice test', status: 'COMPLETED', targetScore: null },
        ],
        latestRecordedResult: {
          examId: 'e2',
          examTitle: 'Practice test',
          takenOn: '2026-09-20',
          isMock: true,
          overallScore: 6,
        },
      }),
    )

    expect(signals.map((signal) => signal.id)).not.toContain('target-vs-recorded')
  })

  it('notes when no CEFR assessment has been recorded', () => {
    const signals = buildObjectiveSignals(baseInput({ hasAnyAssessment: false }))
    const signal = signals.find((entry) => entry.id === 'no-level-assessment')

    expect(signal?.detail).toContain('only ever the ones you record')
  })

  it('never grades the learner and every signal names the fact it came from', () => {
    const inputs: ObjectiveSignalInput[] = [
      baseInput({ objective: null, hasAnyObjective: false }),
      baseInput({ objective: null, hasAnyObjective: true }),
      baseInput({
        objective: {
          title: 'x',
          type: 'IELTS',
          targetScore: null,
          targetDate: null,
        },
        daysUntilTargetDate: null,
        linkedPlanCount: 0,
        linkedExams: [],
        hasAnyAssessment: false,
      }),
      baseInput({
        objective: {
          title: 'x',
          type: 'IELTS',
          targetScore: null,
          targetDate: '2026-09-01',
        },
        daysUntilTargetDate: -45,
      }),
      baseInput({
        objective: {
          title: 'x',
          type: 'IELTS',
          targetScore: null,
          targetDate: '2026-10-20',
        },
        daysUntilTargetDate: 4,
      }),
      baseInput({
        linkedExams: [{ id: 'e1', title: 'IELTS', status: 'COMPLETED', targetScore: 7 }],
        latestRecordedResult: {
          examId: 'e1',
          examTitle: 'IELTS',
          takenOn: '2026-09-20',
          isMock: false,
          overallScore: 6.5,
        },
      }),
      baseInput({
        objective: { title: 'Immigration', type: 'IMMIGRATION', targetScore: null, targetDate: '2027-01-01' },
        linkedExams: [{ id: 'e9', title: 'X', status: 'PLANNED', targetScore: 6 }],
      }),
    ]

    const all = inputs.flatMap((input) => buildObjectiveSignals(input))
    expect(all.length).toBeGreaterThan(8)

    const text = all
      .map((signal) => `${signal.title} ${signal.detail} ${signal.basedOn}`)
      .join(' ')
      .toLowerCase()

    for (const banned of [
      'ready',
      'not ready',
      'weak',
      'strong',
      'behind',
      'on track',
      'ahead of',
      'struggling',
      'predicted',
      'probability',
      'chance of',
      'study time',
      'hours',
      'minutes',
      'should',
    ]) {
      expect(text).not.toContain(banned)
    }

    for (const signal of all) {
      expect(signal.basedOn.trim().length).toBeGreaterThan(0)
      expect(signal.id.trim().length).toBeGreaterThan(0)
    }

    // Every list is free of duplicates and stable across reads, so the panel
    // cannot reshuffle or repeat itself between requests.
    for (const input of inputs) {
      const ids = buildObjectiveSignals(input).map((signal) => signal.id)
      expect(new Set(ids).size).toBe(ids.length)
      expect(buildObjectiveSignals(input).map((signal) => signal.id)).toEqual(ids)
    }
  })

  it('cannot be moved by study data: extra study input changes nothing', () => {
    // The module takes no sessions, streaks or hours. Passing them in anyway — the
    // only way study time could reach it — leaves the output byte-identical.
    const withStudyData = buildObjectiveSignals({
      ...baseInput(),
      studyMinutes: 100_000,
      currentStreakDays: 42,
      sessionsLoggedThisWeek: 30,
    } as ObjectiveSignalInput)

    expect(withStudyData).toEqual(buildObjectiveSignals(baseInput()))
  })
})

type MockRepository = ObjectiveRepository & {
  findActive: Mock
  countByUser: Mock
  setActive: Mock
  countLinkedPlans: Mock
  countLinkedGoals: Mock
  findLinkedExams: Mock
  findLatestResultForExamIds: Mock
  findLatestAssessment: Mock
  findById: Mock
}

function repository(overrides: Record<string, Mock> = {}): MockRepository {
  return {
    findAll: vi.fn(),
    findById: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findActive: vi.fn().mockResolvedValue(null),
    countByUser: vi.fn().mockResolvedValue(0),
    setActive: vi.fn().mockResolvedValue({ count: 1 }),
    countLinkedPlans: vi.fn().mockResolvedValue(0),
    countLinkedGoals: vi.fn().mockResolvedValue(0),
    findLinkedExams: vi.fn().mockResolvedValue([]),
    findLatestResultForExamIds: vi.fn().mockResolvedValue(null),
    findLatestAssessment: vi.fn().mockResolvedValue(null),
    ...overrides,
  } as unknown as MockRepository
}

const OBJECTIVE_ROW = {
  id: 'obj-1',
  userId: 'user-1',
  type: 'IELTS' as const,
  title: 'IELTS Band 7.5',
  description: null,
  targetScore: 7.5,
  targetDate: new Date('2026-11-01T00:00:00.000Z'),
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
}

describe('active objective service', () => {
  it('distinguishes "none created" from "none chosen"', async () => {
    const empty = createObjectiveService(repository())
    expect((await empty.getActiveObjective('user-1', TIMEZONE)).status).toBe('NONE_CREATED')

    const hasSome = createObjectiveService(repository({ countByUser: vi.fn().mockResolvedValue(3) }))
    expect((await hasSome.getActiveObjective('user-1', TIMEZONE)).status).toBe('NONE_SET')
  })

  it('resolves the target countdown in the learner timezone, not on the server clock', async () => {
    const service = createObjectiveService(repository({ findActive: vi.fn().mockResolvedValue(OBJECTIVE_ROW) }))

    const context = await service.getActiveObjective('user-1', TIMEZONE)
    const today = getDayKey(new Date(), TIMEZONE)

    expect(context.status).toBe('SET')
    expect(context.today).toBe(today)
    expect(context.timezone).toBe(TIMEZONE)
    expect(context.daysUntilTargetDate).toBe(diffDayKeys(today, '2026-11-01'))
    expect(context.objective?.targetDate).toBe('2026-11-01T00:00:00.000Z')
  })

  it('refuses to focus an objective that is inactive', async () => {
    const setActive = vi.fn()
    const service = createObjectiveService(
      repository({
        findById: vi.fn().mockResolvedValue({ ...OBJECTIVE_ROW, isActive: false }),
        setActive,
      }),
    )

    await expect(service.setActiveObjective('user-1', 'obj-1', TIMEZONE)).rejects.toThrow(
      /cannot be the active objective/i,
    )
    expect(setActive).not.toHaveBeenCalled()
  })

  it("refuses to focus another user's objective", async () => {
    const service = createObjectiveService(repository({ findById: vi.fn().mockResolvedValue(null) }))

    await expect(service.setActiveObjective('user-1', 'obj-9', TIMEZONE)).rejects.toThrow(
      "LearningObjective with id 'obj-9' not found",
    )
  })

  it('sets the focus and returns the refreshed context', async () => {
    const setActive = vi.fn().mockResolvedValue({ count: 1 })
    const service = createObjectiveService(
      repository({
        findById: vi.fn().mockResolvedValue(OBJECTIVE_ROW),
        findActive: vi.fn().mockResolvedValue(OBJECTIVE_ROW),
        setActive,
      }),
    )

    const context = await service.setActiveObjective('user-1', 'obj-1', TIMEZONE)

    expect(setActive).toHaveBeenCalledWith('user-1', 'obj-1')
    expect(context.objective?.id).toBe('obj-1')
  })

  it('clears the focus without touching the objective itself', async () => {
    const setActive = vi.fn().mockResolvedValue({ count: 1 })
    const service = createObjectiveService(repository({ setActive }))

    const context = await service.setActiveObjective('user-1', null, TIMEZONE)

    expect(setActive).toHaveBeenCalledWith('user-1', null)
    expect(context.objective).toBeNull()
    expect(context.status).toBe('NONE_CREATED')
  })

  it('reports an unknown user instead of writing a dangling focus reference', async () => {
    const service = createObjectiveService(
      repository({ findById: vi.fn().mockResolvedValue(OBJECTIVE_ROW), setActive: vi.fn().mockResolvedValue({ count: 0 }) }),
    )

    await expect(service.setActiveObjective('ghost', 'obj-1', TIMEZONE)).rejects.toThrow(
      "User with id 'ghost' not found",
    )
  })

  it('builds the context from linked exams and the newest recorded result', async () => {
    const service = createObjectiveService(
      repository({
        findActive: vi.fn().mockResolvedValue(OBJECTIVE_ROW),
        countLinkedPlans: vi.fn().mockResolvedValue(1),
        countLinkedGoals: vi.fn().mockResolvedValue(2),
        findLinkedExams: vi.fn().mockResolvedValue([
          {
            id: 'exam-1',
            title: 'IELTS Academic',
            type: 'IELTS',
            status: 'COMPLETED',
            scheduledAt: new Date('2026-09-20T09:00:00.000Z'),
            targetScore: 7.5,
            targetDate: new Date('2026-11-01T00:00:00.000Z'),
          },
        ]),
        findLatestResultForExamIds: vi.fn().mockResolvedValue({
          id: 'res-1',
          examId: 'exam-1',
          isMock: true,
          takenAt: new Date('2026-09-20T11:00:00.000Z'),
          overallScore: 6.5,
          skillScores: { listening: 7, reading: 6.5, written: 'nonsense' },
        }),
        findLatestAssessment: vi.fn().mockResolvedValue({
          id: 'assess-1',
          assessedAt: new Date('2026-08-01T00:00:00.000Z'),
          method: 'FORMAL_EXAM',
          cefrLevel: 'B2',
        }),
      }),
    )

    const context = await service.getActiveObjective('user-1', TIMEZONE)

    expect(context.linkedPlanCount).toBe(1)
    expect(context.linkedGoalCount).toBe(2)
    expect(context.linkedExams).toHaveLength(1)
    expect(context.linkedExams[0]?.scheduledAt).toBe('2026-09-20T09:00:00.000Z')
    expect(context.latestRecordedResult?.overallScore).toBe(6.5)
    // Non-numeric JSON in a legacy score map is dropped rather than surfaced.
    expect(context.latestRecordedResult?.skillScores).toEqual({ listening: 7, reading: 6.5 })
    expect(context.latestAssessment?.cefrLevel).toBe('B2')
    expect(context.signals.some((signal) => signal.id === 'target-vs-recorded')).toBe(true)
  })
})
