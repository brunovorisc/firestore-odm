import { Timestamp } from 'firebase-admin/firestore'

/** Merges `createdAt` and `updatedAt` set to the current server time. */
export function withCreateTimestamps<T extends Record<string, unknown>>(
  data: T,
): T & { createdAt: Timestamp; updatedAt: Timestamp } {
  const now = Timestamp.now()

  return {
    ...data,
    createdAt: now,
    updatedAt: now,
  }
}

/** Merges `updatedAt` set to the current server time. */
export function withUpdateTimestamp<T extends Record<string, unknown>>(
  data: T,
): T & { updatedAt: Timestamp } {
  return {
    ...data,
    updatedAt: Timestamp.now(),
  }
}
