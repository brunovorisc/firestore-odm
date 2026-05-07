import type {
  CollectionReference,
  Firestore,
  Transaction,
  WriteBatch,
} from 'firebase-admin/firestore'
import { AggregateField, FieldPath } from 'firebase-admin/firestore'

import { BatchRepository } from '@/repositories/batch-repository'
import { QueryBuilder } from '@/repositories/query-builder'
import { TransactionRepository } from '@/repositories/transaction-repository'
import type {
  AggregateArgs,
  AggregateResult,
  ApplySelect,
  CountArgs,
  CreateArgs,
  CreateManyArgs,
  DeleteArgs,
  DeleteManyArgs,
  FindFirstArgs,
  FindManyArgs,
  FindUniqueArgs,
  OmitArg,
  SelectArg,
  UpdateArgs,
  UpdateManyArgs,
  UpsertArgs,
  WhereClause,
} from '@/repositories/types'
import { snapshotsToDocs, snapshotToDoc } from '@/utils/converters'
import { NotFoundError } from '@/utils/errors'
import { applyDefaults, extractDocData } from '@/utils/repository-helpers'
import { withCreateTimestamps, withUpdateTimestamp } from '@/utils/timestamps'
import { isWhereById } from '@/utils/where'

export const $setDb = Symbol('setDb')
export const $asTransaction = Symbol('asTransaction')
export const $asBatch = Symbol('asBatch')

const BATCH_SIZE = 500

type BaseDoc = {
  id: string
}

type RepositoryDefaults<TDoc> = Partial<
  Omit<TDoc, 'id' | 'createdAt' | 'updatedAt'>
>

/**
 * Base class for all Firestore repositories. Extend it and pass the collection
 * name to get full CRUD, query, and aggregation support out of the box.
 *
 * @example
 * interface User { id: string; name: string; email: string }
 * type CreateUser = Omit<User, 'id'>
 *
 * class UsersRepo extends BaseRepository<User, CreateUser> {
 *   constructor() { super('users') }
 * }
 *
 * @typeParam TDoc          - Full document shape (must include `id: string`).
 * @typeParam TCreateInput  - Shape used for creates. Defaults to TDoc minus id/timestamps.
 */
export class BaseRepository<
  TDoc extends BaseDoc,
  TCreateInput = Omit<TDoc, 'id' | 'createdAt' | 'updatedAt'>,
> {
  protected collection!: CollectionReference
  private qb!: QueryBuilder<TDoc>

  private readonly collectionName: string
  private readonly defaults: Record<string, unknown>

  /**
   * @param collectionName  Firestore collection path (e.g. `'users'` or `'orgs/acme/members'`).
   * @param db              Optional Firestore instance. Usually injected by `OdmClient`.
   * @param defaults        Default field values merged into every create operation.
   */
  constructor(
    collectionName: string,
    db?: Firestore | null,
    defaults?: RepositoryDefaults<TDoc>,
  ) {
    this.collectionName = collectionName
    this.defaults = (defaults ?? {}) as Record<string, unknown>

    if (db) {
      this[$setDb](db)
    }
  }

  [$setDb](db: Firestore): void {
    this.collection = db.collection(this.collectionName)
    this.qb = new QueryBuilder<TDoc>(this.collection)
  }

  /**
   * Returns a single document or `null`.
   * Uses a direct doc fetch when `where` is `{ id }`, otherwise queries with `take: 1`.
   */
  async findUnique<TSelect extends SelectArg<TDoc> | undefined = undefined>(
    args: Omit<FindUniqueArgs<TDoc>, 'select'> & { select?: TSelect },
  ): Promise<ApplySelect<TDoc, TSelect> | null> {
    const { where, select, omit } = args

    if (isWhereById(where as Record<string, unknown>)) {
      return this.findUniqueById((where as { id: string }).id, select, omit)
    }

    const results = await this.findMany({
      where: where as WhereClause<TDoc>,
      take: 1,
      ...(select ? { select } : {}),
      ...(omit ? { omit } : {}),
    })

    return (results[0] ?? null) as ApplySelect<TDoc, TSelect> | null
  }

  /** Like `findUnique`, but throws `NotFoundError` instead of returning `null`. */
  async findUniqueOrThrow<
    TSelect extends SelectArg<TDoc> | undefined = undefined,
  >(
    args: Omit<FindUniqueArgs<TDoc>, 'select'> & { select?: TSelect },
  ): Promise<ApplySelect<TDoc, TSelect>> {
    const result = await this.findUnique(args)
    this.assertFound(result, args.where as object)
    return result
  }

  /** Returns the first matching document or `null`. */
  async findFirst<TSelect extends SelectArg<TDoc> | undefined = undefined>(
    args: Omit<FindFirstArgs<TDoc>, 'select'> & { select?: TSelect } = {},
  ): Promise<ApplySelect<TDoc, TSelect> | null> {
    const query = await this.buildFindManyQuery({
      ...args,
      take: 1,
    })

    const snap = await query.get()
    const doc = snap.docs[0] ? snapshotToDoc<TDoc>(snap.docs[0]) : null
    const result = doc && args.omit ? this.applyOmit(doc, args.omit) : doc

    return result as ApplySelect<TDoc, TSelect> | null
  }

  /** Like `findFirst`, but throws `NotFoundError` instead of returning `null`. */
  async findFirstOrThrow<
    TSelect extends SelectArg<TDoc> | undefined = undefined,
  >(
    args: Omit<FindFirstArgs<TDoc>, 'select'> & { select?: TSelect } = {},
  ): Promise<ApplySelect<TDoc, TSelect>> {
    const result = await this.findFirst(args)
    this.assertFound(result, args.where ?? {})
    return result
  }

  /** Returns all matching documents. Supports filtering, ordering, pagination, and projection. */
  async findMany<TSelect extends SelectArg<TDoc> | undefined = undefined>(
    args: Omit<FindManyArgs<TDoc>, 'select'> & { select?: TSelect } = {},
  ): Promise<Array<ApplySelect<TDoc, TSelect>>> {
    const query = await this.buildFindManyQuery(args)
    const snap = await query.get()
    let docs = snapshotsToDocs<TDoc>(snap.docs)

    const omit = args.omit
    if (omit) {
      docs = docs.map((doc) => this.applyOmit(doc, omit))
    }

    return docs as Array<ApplySelect<TDoc, TSelect>>
  }

  /**
   * Creates a new document. Auto-generates an id unless `data.id` is provided.
   * Automatically sets `createdAt` and `updatedAt`.
   */
  async create(args: CreateArgs<TCreateInput>): Promise<TDoc> {
    const { id, data } = extractDocData(args.data as Record<string, unknown>)
    const dataWithDefaults = applyDefaults(this.defaults, data)
    const dataWithTimestamps = withCreateTimestamps(dataWithDefaults)

    if (id) {
      await this.collection.doc(id).set(dataWithTimestamps)
      return { id, ...dataWithTimestamps } as unknown as TDoc
    }

    const ref = await this.collection.add(dataWithTimestamps)
    return { id: ref.id, ...dataWithTimestamps } as unknown as TDoc
  }

  /**
   * Creates multiple documents in batched writes (500 per batch).
   * Returns the number of created documents.
   */
  async createMany(
    args: CreateManyArgs<TCreateInput>,
  ): Promise<{ count: number }> {
    await this.runBatchedOps(args.data, (batch, item) => {
      const { id, data } = extractDocData(item as Record<string, unknown>)
      const withDefaults = applyDefaults(this.defaults, data)
      const withTimestamps = withCreateTimestamps(withDefaults)
      const ref = id ? this.collection.doc(id) : this.collection.doc()
      batch.set(ref, withTimestamps)
    })
    return { count: args.data.length }
  }

  /**
   * Updates a document and returns the updated state.
   * Throws `NotFoundError` if the document does not exist.
   */
  async update(args: UpdateArgs<TDoc>): Promise<TDoc> {
    const { where, data } = args
    const dataWithTimestamp = withUpdateTimestamp(
      data as Record<string, unknown>,
    )

    if (isWhereById(where as Record<string, unknown>)) {
      const id = (where as { id: string }).id
      const snap = await this.collection.doc(id).get()
      const existing = snapshotToDoc<TDoc>(snap)
      this.assertFound(existing, where as object)
      await this.collection.doc(id).update(dataWithTimestamp)
      return { ...existing, ...dataWithTimestamp } as TDoc
    }

    const existing = (await this.findUnique({ where })) as TDoc | null
    this.assertFound(existing, where as object)
    await this.collection.doc(existing.id).update(dataWithTimestamp)
    return { ...existing, ...dataWithTimestamp } as TDoc
  }

  /**
   * Updates all documents matching `where`. Fetches ids only (no payload read),
   * then applies updates in batched writes. Returns the number of updated documents.
   */
  async updateMany(args: UpdateManyArgs<TDoc>): Promise<{ count: number }> {
    const snap = await this.qb.buildQuery(args.where).select().get()

    if (snap.empty) return { count: 0 }

    const dataWithTimestamp = withUpdateTimestamp(
      args.data as Record<string, unknown>,
    )

    await this.runBatchedOps(snap.docs, (batch, doc) => {
      batch.update(doc.ref, dataWithTimestamp)
    })

    return { count: snap.docs.length }
  }

  /** Creates the document if it doesn't exist, otherwise updates it. */
  async upsert(args: UpsertArgs<TDoc, TCreateInput>): Promise<TDoc> {
    const existing = (await this.findUnique({
      where: args.where,
    })) as TDoc | null

    if (!existing) {
      return this.create({
        data: args.create as TCreateInput & { id?: string },
      })
    }

    const dataWithTimestamp = withUpdateTimestamp(
      args.update as Record<string, unknown>,
    )

    await this.collection.doc(existing.id).update(dataWithTimestamp)

    return { ...existing, ...dataWithTimestamp } as TDoc
  }

  /** Deletes a document by id. */
  async delete(args: DeleteArgs): Promise<{ id: string }> {
    const { id } = args.where
    await this.collection.doc(id).delete()
    return { id }
  }

  /**
   * Deletes all documents matching `where`.
   * Omit `where` to delete the entire collection.
   * Returns the number of deleted documents.
   */
  async deleteMany(
    args: DeleteManyArgs<TDoc> = {},
  ): Promise<{ count: number }> {
    const snap = await this.qb.buildQuery(args.where).select().get()

    if (snap.empty) return { count: 0 }

    await this.runBatchedOps(snap.docs, (batch, doc) => {
      batch.delete(doc.ref)
    })

    return { count: snap.docs.length }
  }

  /** Counts documents matching `where` using Firestore's native count aggregation. */
  async count(args: CountArgs<TDoc> = {}): Promise<number> {
    const query = this.qb.buildQuery(args.where)
    const snap = await query.count().get()
    return snap.data().count
  }

  /**
   * Computes aggregations using Firestore's native `count`, `sum`, and `average`.
   * Only the aggregations you request are included in the returned object.
   *
   * @example
   * const stats = await repo.aggregate({
   *   where: { active: true },
   *   _count: true,
   *   _sum: { score: true },
   *   _avg: { score: true },
   * })
   * // stats._count, stats._sum.score, stats._avg.score
   */
  async aggregate<TArgs extends AggregateArgs<TDoc>>(
    args: TArgs,
  ): Promise<AggregateResult<TDoc, TArgs>> {
    const query = this.qb.buildQuery(args.where)

    const spec: Record<string, AggregateField<number | null>> = {}

    if (args._count) {
      spec._count = AggregateField.count()
    }

    // Firestore's aggregate spec is a flat Record with unique keys.
    // Prefixes (_sum__, _avg__) prevent collision between same-named fields.
    if (args._sum) {
      for (const field of Object.keys(args._sum)) {
        if (args._sum[field as keyof typeof args._sum]) {
          spec[`_sum__${field}`] = AggregateField.sum(field)
        }
      }
    }

    if (args._avg) {
      for (const field of Object.keys(args._avg)) {
        if (args._avg[field as keyof typeof args._avg]) {
          spec[`_avg__${field}`] = AggregateField.average(field)
        }
      }
    }

    const snap = await query.aggregate(spec).get()
    const raw = snap.data()

    const result: Record<string, unknown> = {}

    if (args._count) {
      result._count = raw._count
    }

    if (args._sum) {
      const sumResult: Record<string, number | null> = {}
      for (const field of Object.keys(args._sum)) {
        if (args._sum[field as keyof typeof args._sum]) {
          sumResult[field] = raw[`_sum__${field}`] as number | null
        }
      }
      result._sum = sumResult
    }

    if (args._avg) {
      const avgResult: Record<string, number | null> = {}
      for (const field of Object.keys(args._avg)) {
        if (args._avg[field as keyof typeof args._avg]) {
          avgResult[field] = raw[`_avg__${field}`] as number | null
        }
      }
      result._avg = avgResult
    }

    return result as AggregateResult<TDoc, TArgs>
  }

  [$asTransaction](tx: Transaction): TransactionRepository<TDoc, TCreateInput> {
    return new TransactionRepository<TDoc, TCreateInput>(
      tx,
      this.collection,
      this.defaults,
    )
  }

  [$asBatch](batch: WriteBatch): BatchRepository<TDoc, TCreateInput> {
    return new BatchRepository<TDoc, TCreateInput>(
      batch,
      this.collection,
      this.defaults,
    )
  }

  private async findUniqueById<
    TSelect extends SelectArg<TDoc> | undefined = undefined,
  >(
    id: string,
    select?: TSelect,
    omit?: OmitArg<TDoc>,
  ): Promise<ApplySelect<TDoc, TSelect> | null> {
    if (!select) {
      const snap = await this.collection.doc(id).get()
      const doc = snapshotToDoc<TDoc>(snap)
      const result = doc && omit ? this.applyOmit(doc, omit) : doc
      return result as ApplySelect<TDoc, TSelect> | null
    }

    const fields = this.getSelectedFields(select)

    const snap = await this.collection
      .where(FieldPath.documentId(), '==', id)
      .select(...fields)
      .limit(1)
      .get()

    const doc = snap.docs[0] ? snapshotToDoc<TDoc>(snap.docs[0]) : null

    return doc as ApplySelect<TDoc, TSelect> | null
  }

  private async buildFindManyQuery<
    TSelect extends SelectArg<TDoc> | undefined = undefined,
  >(args: Omit<FindManyArgs<TDoc>, 'select'> & { select?: TSelect }) {
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
      const cursorSnap = await this.collection.doc(args.cursor.id).get()

      if (!cursorSnap.exists) {
        throw new NotFoundError(this.collectionName, { id: args.cursor.id })
      }

      query = query.startAfter(cursorSnap)
    }

    return query
  }

  private assertFound<T>(result: T | null, where: object): asserts result is T {
    if (result === null) {
      throw new NotFoundError(this.collectionName, where)
    }
  }

  private async runBatchedOps<T>(
    items: T[],
    operation: (batch: WriteBatch, item: T) => void,
  ): Promise<void> {
    const db = this.collection.firestore
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = db.batch()
      for (const item of items.slice(i, i + BATCH_SIZE)) {
        operation(batch, item)
      }
      await batch.commit()
    }
  }

  private applyOmit(doc: TDoc, omit: OmitArg<TDoc>): TDoc {
    const result = { ...doc } as Record<string, unknown>
    for (const [key, shouldOmit] of Object.entries(omit)) {
      if (shouldOmit) {
        delete result[key]
      }
    }
    return result as TDoc
  }

  private getSelectedFields(select: SelectArg<TDoc>): string[] {
    return Object.entries(select as Record<string, boolean | undefined>)
      .filter(([, value]) => value === true)
      .map(([key]) => key)
  }
}
