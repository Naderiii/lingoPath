import { describe, it, expect, vi } from 'vitest'
import type { Mock } from 'vitest'
import {
  CEFR_LEVEL_ORDER,
  buildCurrentSnapshots,
  cefrRank,
  mergeLevels,
  rankByLevel,
  recordedDimensions,
  sortAssessmentsDesc,
} from '../src/modules/assessments/level.domain.js'
import { createAssessmentService } from '../src/modules/assessments/assessment.service.js'
import type { AssessmentRepository } from '../src/modules/assessments/assessment.repository.js'
import { getDayKey } from '../src/shared/timezone.js'

type Row = Awaited<ReturnType<AssessmentRepository['findAllLevels']>>[number]

type RowOverrides = Partial<Omit<Row, 'assessedAt'>> & { id: string; assessedAt: string }

function row(overrides: RowOverrides): Row {
  const assessedAt = new Date(overrides.assessedAt)

  return {
    userId: 'user-1',
    method: 'SELF_REPORTED',
    cefrLevel: null,
    listeningLevel: null,
    readingLevel: null,
    writingLevel: null,
    speakingLevel: null,
    notes: null,
    createdAt: assessedAt,
    updatedAt: assessedAt,
    ...overrides,
    assessedAt,
  } as Row
}

type MockRepository = AssessmentRepository & {
  findMany: Mock
  findAllLevels: Mock
  findById: Mock
  create: Mock
  update: Mock
  delete: Mock
}

function repository(overrides: Record<string, Mock> = {}): MockRepository {
  return {
    findMany: vi.fn(),
    findAllLevels: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  } as unknown as MockRepository
}

describe('CEFR level domain', () => {
  it('ranks the six CEFR levels in ascending order and nothing else', () => {
    expect(CEFR_LEVEL_ORDER).toEqual(['A1', 'A2', 'B1', 'B2', 'C1', 'C2'])
    expect(cefrRank('A1')).toBe(1)
    expect(cefrRank('B2')).toBe(4)
    expect(cefrRank('C2')).toBe(6)

    const ranks = rankByLevel()
    expect(Object.keys(ranks)).toHaveLength(6)
    expect(new Set(Object.values(ranks))).toEqual(new Set([1, 2, 3, 4, 5, 6]))
  })

  it('lists only the dimensions that actually carry a level', () => {
    expect(recordedDimensions({ cefrLevel: 'B1' })).toEqual(['overall'])
    expect(recordedDimensions({ cefrLevel: 'B1', listeningLevel: null })).toEqual(['overall'])
    expect(
      recordedDimensions({
        cefrLevel: 'B1',
        listeningLevel: 'B1',
        readingLevel: 'B2',
        writingLevel: 'B1',
        speakingLevel: 'B2',
      }),
    ).toEqual(['overall', 'listening', 'reading', 'writing', 'speaking'])
    expect(recordedDimensions({})).toEqual([])
  })

  it('keeps dimensions untouched by an update and clears them only on an explicit null', () => {
    const stored = row({
      id: 'a1',
      assessedAt: '2026-09-01T10:00:00.000Z',
      cefrLevel: 'B1',
      listeningLevel: 'B2',
    })

    expect(mergeLevels(stored, { speakingLevel: 'A2' })).toEqual({
      cefrLevel: 'B1',
      listeningLevel: 'B2',
      readingLevel: null,
      writingLevel: null,
      speakingLevel: 'A2',
    })

    expect(mergeLevels(stored, { listeningLevel: null }).listeningLevel).toBeNull()
  })

  it('sorts newest first and breaks same-day ties deterministically', () => {
    const rows = [
      row({ id: 'b', assessedAt: '2026-09-01T10:00:00.000Z' }),
      row({ id: 'a', assessedAt: '2026-09-01T10:00:00.000Z' }),
      row({ id: 'c', assessedAt: '2026-08-01T10:00:00.000Z' }),
    ]

    const sorted = sortAssessmentsDesc(rows)
    expect(sorted.map((entry) => entry.id)).toEqual(['a', 'b', 'c'])
    // The caller's array is left alone.
    expect(rows.map((entry) => entry.id)).toEqual(['b', 'a', 'c'])
  })
})

describe('most recently recorded level per dimension', () => {
  it('reports every dimension as not recorded when nothing has been assessed', () => {
    const current = buildCurrentSnapshots([])

    expect(current.overall).toBeNull()
    expect(current.listening).toBeNull()
    expect(current.reading).toBeNull()
    expect(current.writing).toBeNull()
    expect(current.speaking).toBeNull()
  })

  it('never lets an assessment that skipped a dimension clear an older recording', () => {
    const current = buildCurrentSnapshots([
      row({ id: 'new', assessedAt: '2026-10-01T09:00:00.000Z', cefrLevel: 'B2' }),
      row({ id: 'old', assessedAt: '2026-05-01T09:00:00.000Z', listeningLevel: 'B1' }),
    ])

    // The newer overall-only assessment does not erase the listening history…
    expect(current.listening?.level).toBe('B1')
    expect(current.listening?.assessmentId).toBe('old')
    // …and the overall level comes from the newer one.
    expect(current.overall?.level).toBe('B2')
    expect(current.overall?.assessmentId).toBe('new')
    expect(current.reading).toBeNull()
  })

  it('carries the previous recording so a change can be shown without inventing a baseline', () => {
    const current = buildCurrentSnapshots([
      row({ id: 'third', assessedAt: '2026-10-01T09:00:00.000Z', cefrLevel: 'C1' }),
      row({ id: 'second', assessedAt: '2026-07-01T09:00:00.000Z', cefrLevel: 'B2' }),
      row({ id: 'first', assessedAt: '2026-02-01T09:00:00.000Z', cefrLevel: 'B1' }),
    ])

    const overall = current.overall
    expect(overall?.level).toBe('C1')
    expect(overall?.rank).toBe(5)
    expect(overall?.previousLevel).toBe('B2')
    expect(overall?.previousRank).toBe(4)
    expect(overall?.previousAssessedAt).toBe('2026-07-01T09:00:00.000Z')
    expect(overall?.changeDirection).toBe('up')
    expect(overall?.changeSteps).toBe(1)
    expect(overall?.method).toBe('SELF_REPORTED')
  })

  it('reports no change direction for a first recording and `same` for an unchanged level', () => {
    const first = buildCurrentSnapshots([
      row({ id: 'only', assessedAt: '2026-10-01T09:00:00.000Z', readingLevel: 'A2' }),
    ])

    expect(first.reading?.previousLevel).toBeNull()
    expect(first.reading?.previousRank).toBeNull()
    expect(first.reading?.previousAssessedAt).toBeNull()
    expect(first.reading?.changeDirection).toBeNull()
    expect(first.reading?.changeSteps).toBeNull()

    const steady = buildCurrentSnapshots([
      row({ id: 'b', assessedAt: '2026-10-01T09:00:00.000Z', readingLevel: 'A2' }),
      row({ id: 'a', assessedAt: '2026-04-01T09:00:00.000Z', readingLevel: 'A2' }),
    ])

    expect(steady.reading?.changeDirection).toBe('same')
    expect(steady.reading?.changeSteps).toBe(0)
  })

  it('reports a drop as a drop, without labelling the learner', () => {
    const current = buildCurrentSnapshots([
      row({ id: 'b', assessedAt: '2026-10-01T09:00:00.000Z', writingLevel: 'B1' }),
      row({ id: 'a', assessedAt: '2026-04-01T09:00:00.000Z', writingLevel: 'B2' }),
    ])

    expect(current.writing?.changeDirection).toBe('down')
    expect(current.writing?.changeSteps).toBe(-1)

    // No verdict vocabulary in the computed snapshot.
    const serialized = JSON.stringify(current).toLowerCase()
    for (const banned of ['ready', 'weak', 'strong', 'behind', 'study time', 'studied']) {
      expect(serialized).not.toContain(banned)
    }
  })
})

describe('assessment service', () => {
  it('rejects an assessment that records no dimension at all', async () => {
    const repo = repository()
    const service = createAssessmentService(repo)

    await expect(
      service.createAssessment('user-1', {
        assessedAt: '2026-10-01T00:00:00.000Z',
        method: 'SELF_REPORTED',
      }),
    ).rejects.toThrow(/at least one CEFR level/i)

    expect(repo.create).not.toHaveBeenCalled()
  })

  it('accepts an assessment that records a single dimension', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'a1' })
    const service = createAssessmentService(repository({ create }))

    await service.createAssessment('user-1', {
      speakingLevel: 'B2',
      assessedAt: '2026-10-01T00:00:00.000Z',
      method: 'MOCK_TEST',
    })

    expect(create).toHaveBeenCalledWith('user-1', {
      speakingLevel: 'B2',
      assessedAt: '2026-10-01T00:00:00.000Z',
      method: 'MOCK_TEST',
    })
  })

  it('merges a partial update onto the stored row instead of replacing it', async () => {
    const update = vi.fn().mockResolvedValue({ id: 'a1' })
    const service = createAssessmentService(
      repository({
        findById: vi.fn().mockResolvedValue(
          row({
            id: 'a1',
            assessedAt: '2026-09-01T00:00:00.000Z',
            cefrLevel: 'B1',
            readingLevel: 'B1',
          }),
        ),
        update,
      }),
    )

    await service.updateAssessment('a1', 'user-1', { speakingLevel: 'B2' })

    expect(update).toHaveBeenCalledWith(
      'a1',
      'user-1',
      expect.objectContaining({
        cefrLevel: 'B1',
        readingLevel: 'B1',
        speakingLevel: 'B2',
        listeningLevel: null,
      }),
    )
  })

  it('refuses an update that would clear the only recorded dimension', async () => {
    const update = vi.fn()
    const service = createAssessmentService(
      repository({
        findById: vi.fn().mockResolvedValue(
          row({ id: 'a1', assessedAt: '2026-09-01T00:00:00.000Z', cefrLevel: 'B1' }),
        ),
        update,
      }),
    )

    await expect(service.updateAssessment('a1', 'user-1', { cefrLevel: null })).rejects.toThrow(
      /at least one CEFR level/i,
    )

    expect(update).not.toHaveBeenCalled()
  })

  it('allows clearing one dimension while another remains recorded', async () => {
    const update = vi.fn().mockResolvedValue({ id: 'a1' })
    const service = createAssessmentService(
      repository({
        findById: vi.fn().mockResolvedValue(
          row({
            id: 'a1',
            assessedAt: '2026-09-01T00:00:00.000Z',
            cefrLevel: 'B1',
            listeningLevel: 'B1',
          }),
        ),
        update,
      }),
    )

    await service.updateAssessment('a1', 'user-1', { cefrLevel: null })

    expect(update).toHaveBeenCalledWith('a1', 'user-1', expect.objectContaining({ cefrLevel: null }))
  })

  it('reports a missing assessment as not found on update', async () => {
    const service = createAssessmentService(repository())

    await expect(service.updateAssessment('missing', 'user-1', { cefrLevel: 'B1' })).rejects.toThrow(
      "LevelAssessment with id 'missing' not found",
    )
  })
})

describe('level overview payload', () => {
  const timezone = 'Europe/Berlin'

  it('states that levels come from recorded assessments only, and stays empty without them', async () => {
    const service = createAssessmentService(
      repository({ findAllLevels: vi.fn().mockResolvedValue([]) }),
    )

    const payload = await service.getLevelOverview('user-1', { limit: 20 }, timezone)

    expect(payload.basis).toBe('RECORDED_ASSESSMENTS')
    expect(payload.today).toBe(getDayKey(new Date(), timezone))
    expect(payload.dimensions).toEqual(['overall', 'listening', 'reading', 'writing', 'speaking'])
    expect(payload.rankByLevel['C2']).toBe(6)
    // No assessment recorded → every dimension is "not recorded", never estimated
    // from anything else the account happens to contain.
    expect(Object.values(payload.current).every((snapshot) => snapshot === null)).toBe(true)
    expect(payload.history).toEqual([])
    expect(payload.totalAssessments).toBe(0)
    expect(payload.hasMore).toBe(false)
    expect(payload.nextCursor).toBeNull()
  })

  it('bounds the history page but still reads every assessment for the snapshot', async () => {
    const rows = [
      row({ id: 'c', assessedAt: '2026-10-05T09:00:00.000Z', cefrLevel: 'C1' }),
      row({ id: 'b', assessedAt: '2026-09-05T09:00:00.000Z', cefrLevel: 'B2' }),
      row({ id: 'a', assessedAt: '2026-08-05T09:00:00.000Z', listeningLevel: 'B1' }),
    ]
    const service = createAssessmentService(
      repository({ findAllLevels: vi.fn().mockResolvedValue(rows) }),
    )

    const payload = await service.getLevelOverview('user-1', { limit: 2 }, timezone)

    expect(payload.history.map((entry) => entry.id)).toEqual(['c', 'b'])
    expect(payload.history[0]?.assessedAt).toBe('2026-10-05T09:00:00.000Z')
    // Dimension-keyed levels ship with each entry, so no client has to know which
    // column holds which dimension.
    expect(payload.history[0]?.levels).toEqual({
      overall: 'C1',
      listening: null,
      reading: null,
      writing: null,
      speaking: null,
    })
    expect(payload.history[1]?.levels.listening).toBeNull()
    expect(payload.totalAssessments).toBe(3)
    expect(payload.hasMore).toBe(true)
    expect(payload.nextCursor).toBe('b')
    // The listening level lives on the assessment outside this page and is still
    // reported: a level is never dropped just because it is old.
    expect(payload.current.listening?.level).toBe('B1')
    expect(payload.current.overall?.level).toBe('C1')
  })

  it('orders history newest first even when the repository returns another order', async () => {
    const rows = [
      row({ id: 'a', assessedAt: '2026-08-05T09:00:00.000Z', cefrLevel: 'A2' }),
      row({ id: 'c', assessedAt: '2026-10-05T09:00:00.000Z', cefrLevel: 'B2' }),
      row({ id: 'b', assessedAt: '2026-09-05T09:00:00.000Z', cefrLevel: 'B1' }),
    ]
    const service = createAssessmentService(
      repository({ findAllLevels: vi.fn().mockResolvedValue(rows) }),
    )

    const payload = await service.getLevelOverview('user-1', { limit: 20 }, timezone)

    expect(payload.history.map((entry) => entry.id)).toEqual(['c', 'b', 'a'])
    expect(payload.hasMore).toBe(false)
    expect(payload.nextCursor).toBeNull()
  })
})
