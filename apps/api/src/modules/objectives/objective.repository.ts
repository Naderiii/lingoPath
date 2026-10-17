import type { PrismaClient } from '@prisma/client'
import type { CreateLearningObjective, UpdateLearningObjective } from '@lingopath/types'

export function createObjectiveRepository(prisma: PrismaClient) {
  return {
    findAll(userId: string) {
      return prisma.learningObjective.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      })
    },

    findById(id: string, userId: string) {
      return prisma.learningObjective.findFirst({
        where: { id, userId },
      })
    },

    create(userId: string, data: CreateLearningObjective) {
      return prisma.learningObjective.create({
        data: {
          userId,
          type: data.type,
          title: data.title,
          description: data.description ?? null,
          targetScore: data.targetScore ?? null,
          targetDate: data.targetDate ? new Date(data.targetDate) : null,
          isActive: data.isActive,
        },
      })
    },

    update(id: string, _userId: string, data: UpdateLearningObjective) {
      return prisma.learningObjective.update({
        where: { id },
        data: {
          ...(data.type ? { type: data.type } : {}),
          ...(data.title ? { title: data.title } : {}),
          ...(data.description !== undefined ? { description: data.description ?? null } : {}),
          ...(data.targetScore !== undefined ? { targetScore: data.targetScore ?? null } : {}),
          ...(data.targetDate !== undefined
            ? { targetDate: data.targetDate ? new Date(data.targetDate) : null }
            : {}),
          ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        },
      })
    },

    delete(id: string, _userId: string) {
      return prisma.learningObjective.delete({
        where: { id },
      })
    },

    // ─── Active objective (Phase 9) ────────────────────────────────────────────

    /**
     * The objective designated by `users.active_objective_id`, scoped to the user.
     * The relation filter keeps ownership in the same query, so a focus pointing at
     * another account's objective can never be read.
     */
    findActive(userId: string) {
      return prisma.learningObjective.findFirst({
        where: { userId, activeForUser: { id: userId } },
      })
    },

    /** Total objectives for the user — tells "none selected" apart from "none created". */
    countByUser(userId: string) {
      return prisma.learningObjective.count({ where: { userId } })
    },

    /**
     * Designates (or clears) the active objective. `updateMany` rather than `update`
     * so a missing user row reports `count: 0` instead of throwing a driver error the
     * service cannot classify.
     */
    setActive(userId: string, objectiveId: string | null) {
      return prisma.user.updateMany({
        where: { id: userId },
        data: { activeObjectiveId: objectiveId },
      })
    },

    countLinkedPlans(objectiveId: string, userId: string) {
      return prisma.longTermPlan.count({ where: { objectiveId, userId } })
    },

    countLinkedGoals(objectiveId: string, userId: string) {
      return prisma.goal.count({ where: { objectiveId, userId } })
    },

    /** Linked exams, undated ones last so an upcoming exam leads the list. */
    findLinkedExams(objectiveId: string, userId: string) {
      return prisma.exam.findMany({
        where: { objectiveId, userId },
        orderBy: [{ scheduledAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
      })
    },

    findLatestResultForExamIds(examIds: string[]) {
      if (examIds.length === 0) return Promise.resolve(null)
      return prisma.examResult.findFirst({
        where: { examId: { in: examIds } },
        orderBy: [{ takenAt: 'desc' }, { id: 'asc' }],
      })
    },

    findLatestAssessment(userId: string) {
      return prisma.levelAssessment.findFirst({
        where: { userId },
        orderBy: [{ assessedAt: 'desc' }, { id: 'asc' }],
      })
    },
  }
}

export type ObjectiveRepository = ReturnType<typeof createObjectiveRepository>
