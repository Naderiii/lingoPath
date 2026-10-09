import { describe, it, expect, vi } from 'vitest'
import { createExamService } from '../src/modules/exams/exam.service.js'
import type { ExamRepository } from '../src/modules/exams/exam.repository.js'

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
