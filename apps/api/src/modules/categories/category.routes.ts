import type { FastifyInstance } from 'fastify'
import { createCategoryRepository } from './category.repository.js'
import { createCategoryService } from './category.service.js'
import { CreateCategorySchema, UpdateCategorySchema } from '@lingopath/types'

const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001'

export default async function categoryRoutes(app: FastifyInstance) {
  const categoryService = createCategoryService(createCategoryRepository(app.prisma))

  // GET /api/v1/categories
  app.get('/categories', async (_request, _reply) => {
    const categories = await categoryService.listCategories(DEFAULT_USER_ID)
    return { data: categories }
  })

  // GET /api/v1/categories/:id
  app.get<{ Params: { id: string } }>('/categories/:id', async (request, _reply) => {
    return categoryService.getCategoryById(request.params.id, DEFAULT_USER_ID)
  })

  // POST /api/v1/categories
  app.post('/categories', async (request, reply) => {
    const body = CreateCategorySchema.parse(request.body)
    const category = await categoryService.createCategory(DEFAULT_USER_ID, body)
    return reply.status(201).send(category)
  })

  // PUT /api/v1/categories/:id
  app.put<{ Params: { id: string } }>('/categories/:id', async (request, _reply) => {
    const body = UpdateCategorySchema.parse(request.body)
    return categoryService.updateCategory(request.params.id, DEFAULT_USER_ID, body)
  })

  // DELETE /api/v1/categories/:id
  app.delete<{ Params: { id: string } }>('/categories/:id', async (request, reply) => {
    await categoryService.deleteCategory(request.params.id, DEFAULT_USER_ID)
    return reply.status(204).send()
  })
}
