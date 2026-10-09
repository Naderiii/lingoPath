import { describe, it, expect, vi } from 'vitest'
import { createCategoryService } from '../src/modules/categories/category.service.js'
import type { CategoryRepository } from '../src/modules/categories/category.repository.js'

describe('Category business rules', () => {
  it('should prevent updating default system categories', async () => {
    const mockRepo: Partial<CategoryRepository> = {
      findById: vi.fn().mockResolvedValue({
        id: 'cat-1',
        userId: null,
        name: 'IELTS',
        description: 'System category',
        isDefault: true,
        sortOrder: 1,
      }),
    }

    const service = createCategoryService(mockRepo as CategoryRepository)
    await expect(service.updateCategory('cat-1', 'user-1', { name: 'New Name' })).rejects.toThrow(
      'Default system categories cannot be modified',
    )
  })

  it('should prevent deleting default system categories', async () => {
    const mockRepo: Partial<CategoryRepository> = {
      findById: vi.fn().mockResolvedValue({
        id: 'cat-1',
        userId: null,
        name: 'IELTS',
        description: 'System category',
        isDefault: true,
        sortOrder: 1,
      }),
    }

    const service = createCategoryService(mockRepo as CategoryRepository)
    await expect(service.deleteCategory('cat-1', 'user-1')).rejects.toThrow(
      'Default system categories cannot be deleted',
    )
  })

  it('should throw ConflictError if category with same name exists', async () => {
    const mockRepo: Partial<CategoryRepository> = {
      findByName: vi.fn().mockResolvedValue({
        id: 'existing-cat',
        userId: 'user-1',
        name: 'Grammar Drills',
        description: null,
        isDefault: false,
        sortOrder: 1,
      }),
    }

    const service = createCategoryService(mockRepo as CategoryRepository)
    await expect(
      service.createCategory('user-1', { name: 'Grammar Drills', sortOrder: 0 }),
    ).rejects.toThrow("Category with name 'Grammar Drills' already exists")
  })
})
