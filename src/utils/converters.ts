import type {
  DocumentSnapshot,
  QueryDocumentSnapshot,
} from 'firebase-admin/firestore'

/** Converts a Firestore snapshot to a typed document. Returns `null` if the document doesn't exist. */
export function snapshotToDoc<T extends Record<string, unknown>>(
  snap: DocumentSnapshot | QueryDocumentSnapshot,
): (T & { id: string }) | null {
  if (!snap.exists) {
    return null
  }

  return {
    id: snap.id,
    ...(snap.data() as T),
  }
}

/** Converts an array of query snapshots to typed documents. */
export function snapshotsToDocs<T extends Record<string, unknown>>(
  snaps: QueryDocumentSnapshot[],
): Array<T & { id: string }> {
  return snaps.map((snap) => ({
    id: snap.id,
    ...(snap.data() as T),
  }))
}
