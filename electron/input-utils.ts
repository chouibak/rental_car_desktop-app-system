/**
 * Merge a partial update over the stored row, ignoring keys the caller did not send.
 * Without this a partial payload would blank every column it omits.
 */
export function mergeDefined<T extends object>(existing: T, patch: Partial<T>): T {
  const merged = { ...existing }
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) merged[key as keyof T] = value as T[keyof T]
  }
  return merged
}
