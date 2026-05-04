/**
 * Returns `true` when the where object is exactly `{ id: string }`.
 * Used to skip query construction and do a direct `doc(id).get()` instead.
 */
export function isWhereById(
  where: Record<string, unknown>,
): where is { id: string } {
  return 'id' in where && Object.keys(where).length === 1
}
