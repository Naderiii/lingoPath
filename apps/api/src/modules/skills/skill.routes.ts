import type { FastifyInstance } from 'fastify'
import { createSkillRepository } from './skill.repository.js'
import { createSkillService } from './skill.service.js'

export default async function skillRoutes(app: FastifyInstance) {
  const skillService = createSkillService(createSkillRepository(app.prisma))

  app.get(
    '/skills',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                    description: { type: ['string', 'null'] },
                    isDefault: { type: 'boolean' },
                    sortOrder: { type: 'number' },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (_request, _reply) => {
      const skills = await skillService.listSkills()
      return { data: skills }
    },
  )
}
