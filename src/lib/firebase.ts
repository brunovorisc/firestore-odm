import type { ServiceAccount } from 'firebase-admin/app'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import type { Firestore } from 'firebase-admin/firestore'
import { getFirestore } from 'firebase-admin/firestore'

import { UninitializedError } from '@/utils/errors'

/** Options passed to `createOdmClient`. */
export interface OdmInitOptions {
  /** JSON string of the Firebase service account credentials. */
  serviceAccount: string
  /** Firestore database id. Defaults to `(default)`. */
  database?: string
  /**
   * Connect to the Firestore emulator instead of production.
   * Pass `true` to use `localhost:8080`, or `{ host, port }` to override.
   */
  emulator?: boolean | { host?: string; port?: number }
}

let _db: Firestore | null = null

export function initFirebase(options: OdmInitOptions): Firestore {
  const serviceAccount = JSON.parse(options.serviceAccount) as ServiceAccount

  if (options.emulator) {
    const emulatorOptions =
      typeof options.emulator === 'object' ? options.emulator : {}

    const host = emulatorOptions.host ?? 'localhost'
    const port = emulatorOptions.port ?? 8080

    process.env.FIRESTORE_EMULATOR_HOST = `${host}:${port}`
  }

  let app = getApps()[0]

  if (!app) {
    app = initializeApp({
      credential: cert(serviceAccount),
    })
  }

  _db = getFirestore(app, options.database ?? '(default)')
  _db.settings({ ignoreUndefinedProperties: true })

  return _db
}

export function getDb(): Firestore {
  if (!_db) throw new UninitializedError()
  return _db
}
