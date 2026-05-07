import type { CollectionReference, WriteBatch } from 'firebase-admin/firestore'

import type { UpsertArgs } from '@/repositories/types'
import { applyDefaults, extractDocData } from '@/utils/repository-helpers'
import { withCreateTimestamps, withUpdateTimestamp } from '@/utils/timestamps'

type BaseDoc = { id: string }

/**
 * Write-only repository scoped to a `WriteBatch`.
 * All methods enqueue operations synchronously — no reads are allowed.
 * Obtained via `client.$batch(ctx => ctx.myRepo)` — do not instantiate directly.
 */
export class BatchRepository<
  TDoc extends BaseDoc,
  TCreateInput = Omit<TDoc, 'id' | 'createdAt' | 'updatedAt'>,
> {
  constructor(
    private readonly batch: WriteBatch,
    private readonly collection: CollectionReference,
    private readonly defaults: Record<string, unknown>,
  ) {}

  /** Enqueues a document creation. Auto-generates an id unless `data.id` is provided. */
  create(args: { data: TCreateInput & { id?: string } }): { id: string } {
    const { id, data } = extractDocData(args.data as Record<string, unknown>)
    const withDefaults = applyDefaults(this.defaults, data)
    const withTimestamps = withCreateTimestamps(withDefaults)
    const ref = id ? this.collection.doc(id) : this.collection.doc()
    this.batch.set(ref, withTimestamps)
    return { id: ref.id }
  }

  /** Enqueues an update by id. */
  update(args: {
    where: { id: string }
    data: Partial<Omit<TDoc, 'id' | 'createdAt'>>
  }): void {
    const withTimestamp = withUpdateTimestamp(
      args.data as Record<string, unknown>,
    )
    this.batch.update(this.collection.doc(args.where.id), withTimestamp)
  }

  /**
   * Enqueues a set-with-merge (upsert) by id.
   * `where.id` takes precedence over any id embedded in `create.data`.
   */
  upsert(
    args: Pick<
      UpsertArgs<TDoc, TCreateInput>,
      'where' | 'create' | 'update'
    > & { where: { id: string } },
  ): { id: string } {
    const { data } = extractDocData(args.create as Record<string, unknown>)
    const docId = args.where.id
    const withDefaults = applyDefaults(this.defaults, data)
    const withTimestamps = withCreateTimestamps(withDefaults)
    const updateData = withUpdateTimestamp(
      args.update as Record<string, unknown>,
    )
    this.batch.set(
      this.collection.doc(docId),
      { ...withTimestamps, ...updateData },
      { merge: true },
    )
    return { id: docId }
  }

  /** Enqueues a delete by id. */
  delete(args: { where: { id: string } }): { id: string } {
    this.batch.delete(this.collection.doc(args.where.id))
    return { id: args.where.id }
  }
}
