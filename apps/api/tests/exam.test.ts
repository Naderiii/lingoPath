import { describe, it, expect, vi } from 'vitest'
import type { Mock } from 'vitest'
import { createExamService } from '../src/modules/exams/exam.service.js'
import type { ExamRepository } from '../src/modules/exams/exam.repository.js'

type MockRepository = ExamRepository & {
  findMany: Mock
  findById: Mock
  create: Mock
  update: Mock
  delete: Mock
  createResult: Mock
  findResultsByExamId: Mock
}

const EXAM_ROW = {
  id: 'exam-1',
  userId: 'user-1',
  objectiveId: null,
  type: 'IELTS' as const,
  title: 'IELTS Academic',
  scheduledAt: new Date('2026-11-01T09:00:00.000Z'),
  venue: null,
  status: 'PLANNED' as const,
  targetScore: 7.5,
  targetDate: new Date('2026-11-01T00:00:00.000Z'),
  scoreScale: null,
  notes: null,
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  updatedAt: new Date('2026-09-01T00:00:00.000Z'),
  objective: null,
  results: [],
}

function repository(overrides: Record<string, Mock> = {}): MockRepository {
  return {
    findMany: vi.fn().mockResolvedValue({ items: [], nextCursor: null, hasMore: false }),
    findById: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    createResult: vi.fn(),
    findResultsByExamId: vi.fn(),
    ...overrides,
  } as unknown as MockRepository
}

describe('Exam business rules', () => {
  it('should throw NotFoundError when adding result to non-existent exam', async () => {
    const mockRepo: Partial<ExamRepository> = {
      findById: vi.fn().mockResolvedValue(null),
    }

    const service = createExamService(mockRepo as ExamRepository)
    await expect(
      service.addExamResult('non-existent-exam', 'user-1', {
        isMock: true,
        takenAt: '2026-10-01T00:00:00.000Z',
        overallScore: 7.5,
        skillScores: { listening: 8.0, reading: 7.5, writing: 7.0, speaking: 7.5 },
      }),
    ).rejects.toThrow("Exam with id 'non-existent-exam' not found")
  })
})

describe('Exam scoring scales through the service', () => {
  it('attaches the resolved scale and where it came from', async () => {
    const service = createExamService(repository({ findMany: vi.fn().mockResolvedValue({ items: [EXAM_ROW], nextCursor: null, hasMore: false }) }))

    const listed = await service.listExams('user-1', { limit: 20 })
    const exam = listed.data[0]

    // No descriptor stored on the exam → the IELTS type default applies, and the
    // response says so rather than passing a default off as a choice.
    expect(exam?.scale?.key).toBe('IELTS_BAND')
    expect(exam?.scale?.targetLabel).toBe('Target band')
    expect(exam?.scaleSource).toBe('TYPE_DEFAULT')
    expect(exam?.targetScore).toBe(7.5)
  })

  it('exposes the built-in scales and each type default for the client', () => {
    const service = createExamService(repository())
    const scales = service.listScales()

    expect(scales.data.map((scale) => scale.key)).toEqual(['IELTS_BAND', 'TOEFL_TOTAL'])
    expect(scales.defaults).toEqual({ IELTS: 'IELTS_BAND', TOEFL: 'TOEFL_TOTAL', OTHER: null })
  })

  it('accepts a TOEFL result above the old fixed cap and stores it as reported', async () => {
    const createResult = vi.fn().mockResolvedValue({ id: 'res-1' })
    const service = createExamService(
      repository({
        findById: vi.fn().mockResolvedValue({ ...EXAM_ROW, type: 'TOEFL', title: 'TOEFL iBT' }),
        createResult,
      }),
    )

    await service.addExamResult('exam-1', 'user-1', {
      isMock: false,
      takenAt: '2026-10-01T00:00:00.000Z',
      overallScore: 110,
      skillScores: { listening: 30, reading: 28, writing: 26, speaking: 26 },
    })

    expect(createResult).toHaveBeenCalledTimes(1)
  })

  it('rejects a result that exceeds the exam scale, with the reason attached', async () => {
    const createResult = vi.fn()
    const service = createExamService(
      repository({ findById: vi.fn().mockResolvedValue(EXAM_ROW), createResult }),
    )

    await expect(
      service.addExamResult('exam-1', 'user-1', {
        isMock: true,
        takenAt: '2026-10-01T00:00:00.000Z',
        overallScore: 9.5,
      }),
    ).rejects.toThrow(/IELTS band/)

    expect(createResult).not.toHaveBeenCalled()
  })

  it('rejects a result with no scores at all', async () => {
    const createResult = vi.fn()
    const service = createExamService(
      repository({ findById: vi.fn().mockResolvedValue(EXAM_ROW), createResult }),
    )

    await expect(
      service.addExamResult('exam-1', 'user-1', {
        isMock: true,
        takenAt: '2026-10-01T00:00:00.000Z',
      }),
    ).rejects.toThrow(/overall score or at least one section score/i)

    expect(createResult).not.toHaveBeenCalled()
  })

  it('refuses a stored scale descriptor that does not say what its maximum is', async () => {
    const create = vi.fn()
    const service = createExamService(repository({ create }))

    await expect(
      service.createExam('user-1', {
        type: 'TOEFL',
        title: 'TOEFL iBT',
        status: 'PLANNED',
        scoreScale: { key: 'TOEFL_TOTAL_2027' },
      }),
    ).rejects.toThrow(/unknown score scale/i)

    expect(create).not.toHaveBeenCalled()
  })

  it('lets an exam opt out of its type default with an explicit custom scale', async () => {
    // The mock echoes the stored descriptor back, the way Prisma would.
    const create = vi.fn(async (_userId: string, data: { scoreScale?: unknown }) => ({
      ...EXAM_ROW,
      scoreScale: data.scoreScale ?? null,
    }))
    const service = createExamService(repository({ create }))

    const exam = await service.createExam('user-1', {
      type: 'IELTS',
      title: 'IELTS mock provider',
      status: 'PLANNED',
      scoreScale: { key: 'IELTS_BAND', label: 'Mock provider band', max: 9 },
    })

    expect(exam.scale?.label).toBe('Mock provider band')
    expect(exam.scaleSource).toBe('EXAM')
  })
})
