import type { SkillRepository } from './skill.repository.js'
import { NotFoundError } from '../../shared/errors.js'

export function createSkillService(repository: SkillRepository) {
  return {
    async listSkills() {
      return repository.findAll()
    },

    async getSkillById(id: string) {
      const skill = await repository.findById(id)
      if (!skill) throw new NotFoundError('Skill', id)
      return skill
    },
  }
}

export type SkillService = ReturnType<typeof createSkillService>
