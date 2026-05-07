import type { CollectionReference, Transaction } from 'firebase-admin/firestore'

import { QueryBuilder } from '@/repositories/query-builder'
import type {
  CreateArgs,
  DeleteManyArgs,
  FindFirstArgs,
  FindManyArgs,
  FindUniqueArgs,
  UpdateArgs,
  UpsertArgs,
  WhereClause,
} from '@/repositories/types'
import { snapshotsToDocs, snapshotToDoc } from '@/utils/converters'
import { NotFoundError } from '@/utils/errors'
import { applyDefaults, extractDocData } from '@/utils/repository-helpers'
import { withCreateTimestamps, withUpdateTimestamp } from '@/utils/timestamps'
import { isWhereById } from '@/utils/where'

type BaseDoc = { id: string }

/**
 * Read/write repository scoped to a Firestore transaction.
 * Obtained via `client.$transaction(tx => tx.myRepo)` — do not instantiate directly.
 *
 * All reads must happen before writes (Firestore requirement).
 * The transaction retries automatically on contention.
 */
export class TransactionRepository<
  TDoc extends BaseDoc,
  TCreateInput = Omit<TDoc, 'id' | 'createdAt' | 'updatedAt'>,
> {
  private readonly qb: QueryBuilder<TDoc>

  constructor(
    private readonly tx: Transaction,
    private readonly collection: CollectionReference,
    private readonly defaults: Record<string, unknown>,
  ) {
    this.qb = new QueryBuilder<TDoc>(this.collection)
  }

  /** Returns a single document or `null`. */
  async findUnique(
    args: Pick<FindUniqueArgs<TDoc>, 'where'>,
  ): Promise<TDoc | null> {
    const { where } = args

    if (isWhereById(where as Record<string, unknown>)) {
      const snap = await this.tx.get(
        this.collection.doc((where as { id: string }).id),
      )
      return snapshotToDoc<TDoc>(snap)
    }

    const results = await this.findMany({
      where: where as WhereClause<TDoc>,
      take: 1,
    })

    return results[0] ?? null
  }

  /** Returns the first matching document or `null`. */
  async findFirst(
    args: Pick<FindFirstArgs<TDoc>, 'where' | 'orderBy'> = {},
  ): Promise<TDoc | null> {
    const results = await this.findMany({ ...args, take: 1 })
    return results[0] ?? null
  }

  /** Returns all matching documents. */
  async findMany(
    args: Pick<
      FindManyArgs<TDoc>,
      'where' | 'take' | 'skip' | 'orderBy' | 'cursor' | 'select'
    > = {},
  ): Promise<TDoc[]> {
    let query = this.qb.buildQuery(args.where)

    if (args.orderBy) {
      query = this.qb.applyOrderBy(query, args.orderBy)
    }

    if (args.skip) {
      query = this.qb.applySkip(query, args.skip)
    }

    if (args.take) {
      query = this.qb.applyLimit(query, args.take)
    }

    if (args.select) {
      query = this.qb.applySelect(
        query,
        args.select as Record<string, boolean | undefined>,
      )
    }

    if (args.cursor) {
      const cursorSnap = await this.tx.get(this.collection.doc(args.cursor.id))

      if (!cursorSnap.exists) {
        throw new NotFoundError(this.collection.id, { id: args.cursor.id })
      }

      query = query.startAfter(cursorSnap)
    }

    const snap = await this.tx.get(query)

    return snapshotsToDocs<TDoc>(snap.docs)
  }

  /**
   * Enqueues a document creation. Auto-generates an id unless `data.id` is provided.
   * Returns the full document synchronously (no extra read needed).
   */
  create(args: CreateArgs<TCreateInput>): TDoc {
    const { id, data } = extractDocData(args.data as Record<string, unknown>)
    const withDefaults = applyDefaults(this.defaults, data)
    const withTimestamps = withCreateTimestamps(withDefaults)

    const ref = id ? this.collection.doc(id) : this.collection.doc()

    this.tx.set(ref, withTimestamps)

    return {
      id: ref.id,
      ...withTimestamps,
    } as unknown as TDoc
  }

  /**
   * Enqueues an update. Throws `NotFoundError` when using a `WhereClause` and no match is found.
   * Returns `void` unlike `BaseRepository.update` — the updated document is not available until the transaction commits.
   */
  async update(args: UpdateArgs<TDoc>): Promise<void> {
    const { where, data } = args
    const withTimestamp = withUpdateTimestamp(data as Record<string, unknown>)

    if (isWhereById(where as Record<string, unknown>)) {
      this.tx.update(
        this.collection.doc((where as { id: string }).id),
        withTimestamp,
      )
      return
    }

    const existing = await this.findUnique({ where })
    if (!existing) {
      throw new NotFoundError(this.collection.id, where as object)
    }

    this.tx.update(this.collection.doc(existing.id), withTimestamp)
  }

  /** Creates the document if it doesn't exist, otherwise updates it. */
  async upsert(args: UpsertArgs<TDoc, TCreateInput>): Promise<TDoc> {
    const existing = await this.findUnique({ where: args.where })

    if (!existing) {
      return this.create({
        data: args.create as TCreateInput & { id?: string },
      })
    }

    const withTimestamp = withUpdateTimestamp(
      args.update as Record<string, unknown>,
    )

    this.tx.update(this.collection.doc(existing.id), withTimestamp)

    return { ...existing, ...withTimestamp } as TDoc
  }

  /** Enqueues a delete by id. */
  delete(args: { where: { id: string } }): { id: string } {
    this.tx.delete(this.collection.doc(args.where.id))
    return { id: args.where.id }
  }

  /**
   * Deletes all matching documents within the transaction.
   * Fetches ids only (no payload), then enqueues individual deletes.
   */
  async deleteMany(
    args: Pick<DeleteManyArgs<TDoc>, 'where'> = {},
  ): Promise<{ count: number }> {
    const snap = await this.tx.get(this.qb.buildQuery(args.where).select())

    for (const doc of snap.docs) {
      this.tx.delete(doc.ref)
    }

    return { count: snap.docs.length }
  }
}
