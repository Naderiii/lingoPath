/**
 * Keyset (cursor) pagination — the single implementation for every list endpoint.
 *
 * The public contract everywhere is "cursor = the id of the last row of the
 * previous page", while the rows are ordered by a timestamp column. Filtering
 * with `id < cursor` (a lexicographic UUID comparison) while sorting by time
 * makes pages skip and duplicate rows. The fix resolves the cursor row's sort
 * value and pages with a composite predicate on (sort field, id); `id` is also
 * added to `orderBy` as a deterministic tie-breaker, so equal timestamps have a
 * stable order.
 */

export type SortDirection = 'asc' | 'desc'

export interface KeysetParams {
  cursor?: string | null | undefined
  /**
   * Loads the cursor row's value for the sort field. Return `null`/`undefined`
   * when the row no longer exists or is not visible to this user.
   */
  loadCursorValue: () => Promise<unknown>
  field: string
  direction: SortDirection
}

/** Matches no rows: used when a cursor is stale instead of silently restarting. */
export const EMPTY_PAGE_WHERE = { id: { in: [] } } as const

export async function keysetWhere(
  params: KeysetParams,
): Promise<Record<string, unknown> | undefined> {
  const { cursor, loadCursorValue, field, direction } = params
  if (!cursor) return undefined

  const value = await loadCursorValue()
  if (value === null || value === undefined) {
    return { ...EMPTY_PAGE_WHERE }
  }

  const operator = direction === 'desc' ? 'lt' : 'gt'
  return {
    OR: [{ [field]: { [operator]: value } }, { [field]: value, id: { [operator]: cursor } }],
  }
}

/** Deterministic ordering for a list endpoint: the sort field, then id. */
export function keysetOrderBy(field: string, direction: SortDirection) {
  return [{ [field]: direction }, { id: direction }]
}
