import type { FieldValue } from 'firebase-admin/firestore'

type WithFieldValue<T> = {
  [K in keyof T]?: T[K] | FieldValue
}

type TrueKeys<T> = { [K in keyof T]: T[K] extends true ? K : never }[keyof T]

/** Operator-based filter for a single field value. */
export type WhereOperatorFilter<TVal> = {
  equals?: TVal
  notEquals?: TVal
  gt?: TVal
  gte?: TVal
  lt?: TVal
  lte?: TVal
  in?: TVal[]
  notIn?: TVal[]
  arrayContains?: TVal extends Array<infer U> ? U : never
  arrayContainsAny?: TVal extends Array<infer U> ? U[] : never
}

/**
 * Query filter object. Each field accepts a direct value (shorthand for `equals`)
 * or an operator filter. Supports logical `OR`, `AND`, and `NOT` combinators.
 */
export type WhereClause<TDoc> = {
  [K in keyof TDoc]?: TDoc[K] | WhereOperatorFilter<TDoc[K]>
} & {
  OR?: Array<WhereClause<TDoc>>
  AND?: Array<WhereClause<TDoc>>
  NOT?: WhereClause<TDoc>
}

/** Field → sort direction map. Pass an array to sort by multiple fields. */
export type OrderByClause<TDoc> = Partial<
  Record<keyof TDoc & string, 'asc' | 'desc'>
>

/** Map of field → `true` to include only those fields in the result. */
export type SelectArg<TDoc> = Partial<Record<keyof TDoc, boolean>>

/** Map of field → `true` to strip those fields from the result. */
export type OmitArg<TDoc> = Partial<Record<keyof TDoc, boolean>>

/**
 * Narrows `TDoc` to only the fields marked `true` in `TSelect`.
 * Returns `TDoc` unchanged when `TSelect` is `undefined`.
 */
export type ApplySelect<TDoc, TSelect extends SelectArg<TDoc> | undefined> = [
  TSelect,
] extends [undefined]
  ? TDoc
  : Pick<TDoc, Extract<TrueKeys<NonNullable<TSelect>>, keyof TDoc>>

/**
 * Removes fields marked `true` in `TOmit` from `TDoc`.
 * Returns `TDoc` unchanged when `TOmit` is `undefined`.
 */
export type ApplyOmit<TDoc, TOmit extends OmitArg<TDoc> | undefined> = [
  TOmit,
] extends [undefined]
  ? TDoc
  : Omit<TDoc, Extract<TrueKeys<NonNullable<TOmit>>, keyof TDoc>>

/** Args for {@link BaseRepository.findUnique}. */
export interface FindUniqueArgs<TDoc> {
  where: { id: string } | WhereClause<TDoc>
  select?: SelectArg<TDoc>
  omit?: OmitArg<TDoc>
}

/** Args for {@link BaseRepository.findMany}. */
export interface FindManyArgs<TDoc> {
  where?: WhereClause<TDoc>
  orderBy?: OrderByClause<TDoc> | Array<OrderByClause<TDoc>>
  /** Maximum number of documents to return. */
  take?: number
  /** Number of documents to skip (offset). */
  skip?: number
  /** Cursor-based pagination: start after the document with this id. */
  cursor?: { id: string }
  select?: SelectArg<TDoc>
  omit?: OmitArg<TDoc>
}

/** Args for {@link BaseRepository.findFirst}. */
export interface FindFirstArgs<TDoc> {
  where?: WhereClause<TDoc>
  orderBy?: OrderByClause<TDoc> | Array<OrderByClause<TDoc>>
  take?: number
  select?: SelectArg<TDoc>
  omit?: OmitArg<TDoc>
}

/** Args for {@link BaseRepository.create}. Provide `id` to use a custom document id. */
export interface CreateArgs<TCreateInput> {
  data: TCreateInput & { id?: string }
}

/** Args for {@link BaseRepository.createMany}. */
export interface CreateManyArgs<TCreateInput> {
  data: Array<TCreateInput & { id?: string }>
}

/** Args for {@link BaseRepository.update}. Throws `NotFoundError` if no match. */
export interface UpdateArgs<TDoc> {
  where: { id: string } | WhereClause<TDoc>
  data: WithFieldValue<Omit<TDoc, 'id' | 'createdAt'>>
}

/** Args for {@link BaseRepository.updateMany}. */
export interface UpdateManyArgs<TDoc> {
  where: WhereClause<TDoc>
  data: WithFieldValue<Omit<TDoc, 'id' | 'createdAt'>>
}

/** Args for {@link BaseRepository.upsert}. */
export interface UpsertArgs<
  TDoc,
  TCreateInput = Omit<TDoc, 'id' | 'createdAt' | 'updatedAt'>,
> {
  where: { id: string } | WhereClause<TDoc>
  /** Data used when the document does not exist. */
  create: TCreateInput
  /** Data merged when the document already exists. */
  update: WithFieldValue<Omit<TDoc, 'id' | 'createdAt'>>
}

/** Args for {@link BaseRepository.delete}. */
export interface DeleteArgs {
  where: { id: string }
}

/** Args for {@link BaseRepository.deleteMany}. Omit `where` to delete all documents. */
export interface DeleteManyArgs<TDoc> {
  where?: WhereClause<TDoc>
}

/** Args for {@link BaseRepository.count}. */
export interface CountArgs<TDoc> {
  where?: WhereClause<TDoc>
}

/**
 * Args for {@link BaseRepository.aggregate}.
 * Include `_count`, `_sum`, and/or `_avg` to select which aggregations to compute.
 */
export interface AggregateArgs<TDoc> {
  where?: WhereClause<TDoc>
  _count?: true
  _sum?: Partial<Record<keyof TDoc & string, boolean>>
  _avg?: Partial<Record<keyof TDoc & string, boolean>>
}

/**
 * Return type of {@link BaseRepository.aggregate}, shaped by the requested aggregations.
 * Only the keys present in the args are included in the result.
 */
export type AggregateResult<
  TDoc,
  TArgs extends AggregateArgs<TDoc>,
> = (TArgs extends { _count: true }
  ? { _count: number }
  : Record<never, never>) &
  (TArgs extends { _sum: infer S }
    ? { _sum: { [K in keyof S]: number | null } }
    : Record<never, never>) &
  (TArgs extends { _avg: infer A }
    ? { _avg: { [K in keyof A]: number | null } }
    : Record<never, never>)
