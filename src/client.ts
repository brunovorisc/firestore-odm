import type { Firestore } from 'firebase-admin/firestore'

import { initFirebase, type OdmInitOptions } from '@/lib/firebase'
import {
  $asBatch,
  $asTransaction,
  $setDb,
  type BaseRepository,
} from '@/repositories/base-repository'
import type { BatchRepository } from '@/repositories/batch-repository'
import type { TransactionRepository } from '@/repositories/transaction-repository'
import { UninitializedError } from '@/utils/errors'

type AnyRepos = Record<string, BaseRepository<any, any>>

/** Maps each repository to its `TransactionRepository` counterpart. */
export type OdmTransactionContext<TRepos extends AnyRepos> = {
  [K in keyof TRepos]: TRepos[K] extends BaseRepository<
    infer TDoc,
    infer TCreate
  >
    ? TransactionRepository<TDoc, TCreate>
    : never
}

/** Maps each repository to its `BatchRepository` counterpart. */
export type OdmBatchContext<TRepos extends AnyRepos> = {
  [K in keyof TRepos]: TRepos[K] extends BaseRepository<
    infer TDoc,
    infer TCreate
  >
    ? BatchRepository<TDoc, TCreate>
    : never
}

/**
 * Entry point for the ODM. Holds all repositories and manages the Firestore connection.
 *
 * Prefer the `createOdmClient` factory over instantiating this directly.
 */
export class OdmClient<TRepos extends AnyRepos> {
  protected readonly repos: TRepos
  private db: Firestore | null = null

  constructor(repos: TRepos) {
    this.repos = repos
  }

  /** Initializes the Firestore connection and binds it to all repositories. */
  init(options: OdmInitOptions): this {
    this.db = initFirebase(options)
    this.bindRepositories(this.db)
    return this
  }

  /**
   * Runs `fn` inside a Firestore transaction.
   * All reads must happen before writes. The transaction retries automatically on contention.
   */
  async $transaction<T>(
    fn: (tx: OdmTransactionContext<TRepos>) => Promise<T>,
  ): Promise<T> {
    if (!this.db) throw new UninitializedError()
    return this.db.runTransaction((firestoreTx) =>
      fn(
        this.buildContext<OdmTransactionContext<TRepos>>((repo) =>
          repo[$asTransaction](firestoreTx),
        ),
      ),
    )
  }

  /**
   * Runs `fn` with a write-only batch context, then commits atomically.
   * No reads are allowed inside `fn` — use `$transaction` if you need reads.
   */
  async $batch(fn: (ctx: OdmBatchContext<TRepos>) => void): Promise<void> {
    if (!this.db) throw new UninitializedError()
    const writeBatch = this.db.batch()
    fn(
      this.buildContext<OdmBatchContext<TRepos>>((repo) =>
        repo[$asBatch](writeBatch),
      ),
    )
    await writeBatch.commit()
  }

  private buildContext<TContext>(
    factory: (repo: BaseRepository<any, any>) => unknown,
  ): TContext {
    return Object.fromEntries(
      Object.entries(this.repos).map(([key, repo]) => [key, factory(repo)]),
    ) as TContext
  }

  private bindRepositories(db: Firestore): void {
    for (const repo of Object.values(this.repos)) {
      repo[$setDb](db)
    }
  }
}

/**
 * Creates and initializes an `OdmClient` in one call.
 * Repositories are accessible directly on the returned client (e.g. `db.users`).
 *
 * @example
 * const db = createOdmClient(
 *   { users: new UsersRepo(), posts: new PostsRepo() },
 *   { serviceAccount: process.env.FIREBASE_SA! },
 * )
 * await db.users.findMany()
 * await db.$transaction(async (tx) => { ... })
 */
export function createOdmClient<TRepos extends AnyRepos>(
  repos: TRepos,
  options: OdmInitOptions,
): OdmClient<TRepos> & TRepos {
  const client = new OdmClient(repos).init(options)
  return Object.assign(client, repos) as OdmClient<TRepos> & TRepos
}
