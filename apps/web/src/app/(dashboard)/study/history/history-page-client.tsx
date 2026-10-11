'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Search,
  ChevronDown,
  ChevronUp,
  Pencil,
  Trash2,
  Clock,
  BookOpen,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  useSessions,
  useSkills,
  useCategories,
  useDeleteSession,
  useUpdateSession,
  formatDuration,
  sessionKeys,
} from '@/lib/hooks/use-sessions'
import type { SessionFilters, StudySessionItem, UpdateSessionInput } from '@/lib/hooks/use-sessions'
import { useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { LoadingState } from '@/components/shared/loading-state'
import { ErrorState } from '@/components/shared/error-state'
import { EmptyState } from '@/components/shared/empty-state'

type SortField = 'startedAt' | 'durationMinutes' | 'createdAt'
type SortOrder = 'asc' | 'desc'

export function HistoryPageClient() {
  const queryClient = useQueryClient()
  const { data: skills = [] } = useSkills()
  const { data: categories = [] } = useCategories()
  const deleteSession = useDeleteSession()
  const updateSession = useUpdateSession()

  // Filters
  const [skillFilter, setSkillFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [sortBy, setSortBy] = useState<SortField>('startedAt')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [cursor, setCursor] = useState<string | undefined>()
  const [limit] = useState(20)

  // Edit modal
  const [editingSession, setEditingSession] = useState<StudySessionItem | null>(null)
  const [editForm, setEditForm] = useState<UpdateSessionInput>({})

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const filters: SessionFilters = {
    limit,
    ...(cursor ? { cursor } : {}),
    ...(skillFilter ? { skillId: skillFilter } : {}),
    ...(categoryFilter ? { categoryId: categoryFilter } : {}),
    ...(dateFrom ? { from: new Date(`${dateFrom}T00:00:00`).toISOString() } : {}),
    ...(dateTo ? { to: new Date(`${dateTo}T23:59:59`).toISOString() } : {}),
    ...(search ? { search } : {}),
    sortBy,
    sortOrder,
  }

  const { data, isLoading, error, refetch } = useSessions(filters)

  const handleSearch = useCallback(() => {
    setSearch(searchInput)
    setCursor(undefined)
  }, [searchInput])

  const handleClearFilters = useCallback(() => {
    setSkillFilter('')
    setCategoryFilter('')
    setDateFrom('')
    setDateTo('')
    setSearch('')
    setSearchInput('')
    setSortBy('startedAt')
    setSortOrder('desc')
    setCursor(undefined)
  }, [])

  const toggleSort = useCallback(
    (field: SortField) => {
      if (sortBy === field) {
        setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))
      } else {
        setSortBy(field)
        setSortOrder('desc')
      }
      setCursor(undefined)
    },
    [sortBy],
  )

  const handleNextPage = useCallback(() => {
    if (data?.meta.nextCursor) {
      setCursor(data.meta.nextCursor)
    }
  }, [data?.meta.nextCursor])

  const handlePrevPage = useCallback(() => {
    // Cursor-based pagination doesn't natively support "previous"
    // Reset to first page
    setCursor(undefined)
  }, [])

  const handleEditOpen = useCallback((session: StudySessionItem) => {
    setEditingSession(session)
    setEditForm({
      skillId: session.skillId,
      categoryId: session.categoryId,
      topic: session.topic,
      notes: session.notes,
      selfRating: session.selfRating,
    })
  }, [])

  const handleEditSave = useCallback(async () => {
    if (!editingSession) return
    try {
      await updateSession.mutateAsync({ id: editingSession.id, data: editForm })
      setEditingSession(null)
      void queryClient.invalidateQueries({ queryKey: sessionKeys.all })
    } catch {
      // Error handled by mutation
    }
  }, [editingSession, editForm, updateSession, queryClient])

  const handleDelete = useCallback(async () => {
    if (!deletingId) return
    try {
      await deleteSession.mutateAsync(deletingId)
      setDeletingId(null)
      void queryClient.invalidateQueries({ queryKey: sessionKeys.all })
    } catch {
      // Error handled by mutation
    }
  }, [deletingId, deleteSession, queryClient])

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortBy !== field) return null
    return sortOrder === 'desc' ? (
      <ChevronDown className="h-3.5 w-3.5" />
    ) : (
      <ChevronUp className="h-3.5 w-3.5" />
    )
  }

  const hasActiveFilters = skillFilter || categoryFilter || dateFrom || dateTo || search

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/study">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Study History</h2>
            <p className="text-muted-foreground mt-1">
              Browse, filter, and manage all your study sessions.
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-3 rounded-lg border p-4">
        <div className="flex flex-wrap gap-3">
          {/* Search */}
          <div className="flex min-w-[200px] flex-1 gap-2">
            <div className="relative flex-1">
              <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Search topics, notes..."
                className="border-input bg-background w-full rounded-md border py-2 pl-9 pr-3 text-sm"
              />
            </div>
            <Button variant="outline" size="sm" onClick={handleSearch}>
              Search
            </Button>
          </div>

          {/* Skill Filter */}
          <select
            value={skillFilter}
            onChange={(e) => {
              setSkillFilter(e.target.value)
              setCursor(undefined)
            }}
            className="border-input bg-background rounded-md border px-3 py-2 text-sm"
          >
            <option value="">All Skills</option>
            {skills.map((skill) => (
              <option key={skill.id} value={skill.id}>
                {skill.name}
              </option>
            ))}
          </select>

          {/* Category Filter */}
          <select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value)
              setCursor(undefined)
            }}
            className="border-input bg-background rounded-md border px-3 py-2 text-sm"
          >
            <option value="">All Categories</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>

        {/* Date Range */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-muted-foreground text-sm">From:</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value)
                setCursor(undefined)
              }}
              className="border-input bg-background rounded-md border px-3 py-1.5 text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-muted-foreground text-sm">To:</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value)
                setCursor(undefined)
              }}
              className="border-input bg-background rounded-md border px-3 py-1.5 text-sm"
            />
          </div>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={handleClearFilters} className="gap-1.5">
              <X className="h-3.5 w-3.5" />
              Clear Filters
            </Button>
          )}
        </div>
      </div>

      {/* Sort Headers */}
      <div className="hidden items-center gap-4 border-b pb-2 text-sm font-medium md:flex">
        <button
          onClick={() => toggleSort('startedAt')}
          className="hover:text-foreground text-muted-foreground flex items-center gap-1 transition-colors"
        >
          Date/Time <SortIcon field="startedAt" />
        </button>
        <div className="flex-1" />
        <button
          onClick={() => toggleSort('durationMinutes')}
          className="hover:text-foreground text-muted-foreground flex items-center gap-1 transition-colors"
        >
          Duration <SortIcon field="durationMinutes" />
        </button>
        <button
          onClick={() => toggleSort('createdAt')}
          className="hover:text-foreground text-muted-foreground flex items-center gap-1 transition-colors"
        >
          Created <SortIcon field="createdAt" />
        </button>
        <div className="w-20" /> {/* Actions space */}
      </div>

      {/* Results */}
      {isLoading ? (
        <LoadingState label="Loading sessions..." />
      ) : error ? (
        <ErrorState message="Failed to load sessions." onRetry={() => void refetch()} />
      ) : !data?.data.length ? (
        <EmptyState
          icon={BookOpen}
          title="No sessions found"
          description={
            hasActiveFilters
              ? 'Try adjusting your filters to find sessions.'
              : 'Start studying to see your sessions here.'
          }
        />
      ) : (
        <div className="space-y-2">
          {data.data.map((session) => (
            <div
              key={session.id}
              className="flex items-start gap-4 rounded-lg border p-4 transition-colors hover:bg-accent/50"
            >
              <div className="bg-primary/10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
                <BookOpen className="text-primary h-5 w-5" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{session.skill.name}</p>
                    <div className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                      <span>
                        {new Date(session.startedAt).toLocaleDateString([], {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </span>
                      <span>·</span>
                      <span>
                        {new Date(session.startedAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      {session.category && (
                        <>
                          <span>·</span>
                          <span>{session.category.name}</span>
                        </>
                      )}
                      {session.topic && (
                        <>
                          <span>·</span>
                          <span className="truncate">{session.topic}</span>
                        </>
                      )}
                    </div>
                    {session.notes && (
                      <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">
                        {session.notes}
                      </p>
                    )}
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      {session.selfRating && (
                        <div className="flex gap-0.5">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <span
                              key={star}
                              className={cn(
                                'text-xs',
                                star <= session.selfRating!
                                  ? 'text-yellow-500'
                                  : 'text-gray-300 dark:text-gray-600',
                              )}
                            >
                              ★
                            </span>
                          ))}
                        </div>
                      )}
                      {session.isManual && (
                        <span className="bg-secondary text-secondary-foreground rounded px-1.5 py-0.5 text-xs">
                          Manual
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-muted-foreground flex items-center gap-1 text-sm">
                      <Clock className="h-3.5 w-3.5" />
                      {formatDuration(session.durationMinutes)}
                    </span>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleEditOpen(session)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-500 hover:text-red-600"
                        onClick={() => setDeletingId(session.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {data && (
        <div className="flex items-center justify-between border-t pt-4">
          <p className="text-muted-foreground text-sm">
            Showing {data.data.length} session{data.data.length !== 1 ? 's' : ''}
            {data.meta.hasMore && ' (more available)'}
          </p>
          <div className="flex gap-2">
            {cursor && (
              <Button variant="outline" size="sm" onClick={handlePrevPage}>
                First Page
              </Button>
            )}
            {data.meta.hasMore && (
              <Button variant="outline" size="sm" onClick={handleNextPage}>
                Next Page
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Edit Modal */}
      <Dialog open={!!editingSession} onOpenChange={(open) => !open && setEditingSession(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Session</DialogTitle>
            <DialogDescription>
              Update the details of this study session.
            </DialogDescription>
          </DialogHeader>
          {editingSession && (
            <div className="space-y-4">
              {/* Skill */}
              <div>
                <label className="text-sm font-medium" htmlFor="edit-skill">
                  Skill
                </label>
                <select
                  id="edit-skill"
                  value={editForm.skillId ?? editingSession.skillId}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, skillId: e.target.value }))}
                  className="border-input bg-background mt-1 block w-full rounded-md border px-3 py-2 text-sm"
                >
                  {skills.map((skill) => (
                    <option key={skill.id} value={skill.id}>
                      {skill.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Category */}
              <div>
                <label className="text-sm font-medium" htmlFor="edit-category">
                  Category
                </label>
                <select
                  id="edit-category"
                  value={editForm.categoryId ?? ''}
                  onChange={(e) =>
                    setEditForm((prev) => ({
                      ...prev,
                      categoryId: e.target.value || null,
                    }))
                  }
                  className="border-input bg-background mt-1 block w-full rounded-md border px-3 py-2 text-sm"
                >
                  <option value="">No category</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Topic */}
              <div>
                <label className="text-sm font-medium" htmlFor="edit-topic">
                  Topic
                </label>
                <input
                  id="edit-topic"
                  type="text"
                  value={editForm.topic ?? ''}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, topic: e.target.value || null }))
                  }
                  className="border-input bg-background mt-1 block w-full rounded-md border px-3 py-2 text-sm"
                  maxLength={200}
                />
              </div>

              {/* Notes */}
              <div>
                <label className="text-sm font-medium" htmlFor="edit-notes">
                  Notes
                </label>
                <textarea
                  id="edit-notes"
                  value={editForm.notes ?? ''}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, notes: e.target.value || null }))
                  }
                  rows={3}
                  className="border-input bg-background mt-1 block w-full rounded-md border px-3 py-2 text-sm"
                  maxLength={2000}
                />
              </div>

              {/* Self Rating */}
              <div>
                <label className="text-sm font-medium">Self Rating</label>
                <div className="mt-1 flex gap-1">
                  {[1, 2, 3, 4, 5].map((rating) => (
                    <button
                      key={rating}
                      type="button"
                      onClick={() =>
                        setEditForm((prev) => ({
                          ...prev,
                          selfRating: prev.selfRating === rating ? null : rating,
                        }))
                      }
                      className={cn(
                        'flex h-9 w-9 items-center justify-center rounded-md border text-sm font-medium transition-colors',
                        (editForm.selfRating ?? editingSession.selfRating) === rating
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-input hover:bg-accent',
                      )}
                    >
                      {rating}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setEditingSession(null)}>
                  Cancel
                </Button>
                <Button onClick={handleEditSave} disabled={updateSession.isPending}>
                  {updateSession.isPending ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deletingId} onOpenChange={(open) => !open && setDeletingId(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Delete Session</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this study session? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setDeletingId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteSession.isPending}
            >
              {deleteSession.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
