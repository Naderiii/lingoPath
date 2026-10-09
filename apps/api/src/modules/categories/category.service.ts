import type { CategoryRepository } from './category.repository.js'
import type { CreateCategory, UpdateCategory } from '@lingopath/types'
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors.js'

export function createCategoryService(repository: CategoryRepository) {
  return {
    async listCategories(userId: string) {
      return repository.findAll(userId)
    },

    async getCategoryById(id: string, userId: string) {
      const category = await repository.findById(id, userId)
      if (!category) throw new NotFoundError('Category', id)
      return category
    },

    async createCategory(userId: string, data: CreateCategory) {
      const existing = await repository.findByName(data.name, userId)
      if (existing) {
        throw new ConflictError(`Category with name '${data.name}' already exists`)
      }
      return repository.create(userId, data)
    },

    async updateCategory(id: string, userId: string, data: UpdateCategory) {
      const existing = await repository.findById(id, userId)
      if (!existing) throw new NotFoundError('Category', id)
      if (existing.isDefault) {
        throw new ValidationError('Default system categories cannot be modified')
      }

      if (data.name && data.name !== existing.name) {
        const nameConflict = await repository.findByName(data.name, userId)
        if (nameConflict) {
          throw new ConflictError(`Category with name '${data.name}' already exists`)
        }
      }

      return repository.update(id, userId, data)
    },

    async deleteCategory(id: string, userId: string) {
      const existing = await repository.findById(id, userId)
      if (!existing) throw new NotFoundError('Category', id)
      if (existing.isDefault) {
        throw new ValidationError('Default system categories cannot be deleted')
      }
      await repository.delete(id, userId)
    },
  }
}

export type CategoryService = ReturnType<typeof createCategoryService>
