import type {
  CollectionReference,
  Query,
  WhereFilterOp,
} from 'firebase-admin/firestore'
import { FieldPath, Filter } from 'firebase-admin/firestore'

import type {
  OrderByClause,
  WhereClause,
  WhereOperatorFilter,
} from '@/repositories/types'

const OPERATOR_MAP: Record<keyof WhereOperatorFilter<unknown>, WhereFilterOp> =
  {
    equals: '==',
    notEquals: '!=',
    gt: '>',
    gte: '>=',
    lt: '<',
    lte: '<=',
    in: 'in',
    notIn: 'not-in',
    arrayContains: 'array-contains',
    arrayContainsAny: 'array-contains-any',
  }

// Inverted operators used by the NOT clause.
const NEGATED_OPERATOR_MAP: Partial<
  Record<keyof WhereOperatorFilter<unknown>, WhereFilterOp>
> = {
  equals: '!=',
  notEquals: '==',
  gt: '<=',
  gte: '<',
  lt: '>=',
  lte: '>',
  in: 'not-in',
  notIn: 'in',
}

function isOperatorFilter(
  value: unknown,
): value is WhereOperatorFilter<unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  return Object.keys(value).some((k) => k in OPERATOR_MAP)
}

/** Translates `WhereClause` and `OrderByClause` objects into Firestore `Query` instances. */
export class QueryBuilder<TDoc extends Record<string, unknown>> {
  constructor(private readonly collection: CollectionReference) {}

  /** Returns a query with the given `where` filter applied, or the bare collection query if no filter. */
  buildQuery(where?: WhereClause<TDoc>): Query {
    if (!where) return this.collection as Query
    return this.applyWhere(this.collection, where)
  }

  /** Applies a `WhereClause` to an existing query. */
  applyWhere(
    query: Query | CollectionReference,
    where: WhereClause<TDoc>,
  ): Query {
    const filter = this.clauseToFilter(where)
    if (!filter) return query as Query
    return (query as Query).where(filter)
  }

  /** Applies one or more `orderBy` clauses to a query. */
  applyOrderBy(
    query: Query,
    orderBy: OrderByClause<TDoc> | Array<OrderByClause<TDoc>>,
  ): Query {
    const clauses = Array.isArray(orderBy) ? orderBy : [orderBy]
    return clauses.reduce(
      (q, clause) =>
        Object.entries(clause).reduce(
          (q, [field, direction]) => q.orderBy(field, direction ?? 'asc'),
          q,
        ),
      query,
    )
  }

  applyLimit(query: Query, limit: number): Query {
    return query.limit(limit)
  }

  applySkip(query: Query, skip: number): Query {
    return query.offset(skip)
  }

  /** Applies field projection. Passes through unchanged if no fields are selected. */
  applySelect(
    query: Query,
    select: Record<string, boolean | undefined>,
  ): Query {
    const fields = Object.keys(select).filter((k) => select[k] === true)
    return fields.length > 0 ? query.select(...fields) : query
  }

  /**
   * Converts a `WhereClause` to a Firestore `Filter` tree.
   * Returns `null` if the clause is empty (no filters to apply).
   */
  clauseToFilter(where: WhereClause<TDoc>): Filter | null {
    const filters: Filter[] = []

    for (const [field, value] of Object.entries(where)) {
      if (value === undefined) continue

      if (field === 'OR') {
        const nested = (value as Array<WhereClause<TDoc>>)
          .map((c) => this.clauseToFilter(c))
          .filter((f): f is Filter => f !== null)
        if (nested.length > 0) {
          filters.push(nested.length === 1 ? nested[0] : Filter.or(...nested))
        }
        continue
      }

      if (field === 'AND') {
        const nested = (value as Array<WhereClause<TDoc>>)
          .map((c) => this.clauseToFilter(c))
          .filter((f): f is Filter => f !== null)
        if (nested.length > 0) {
          filters.push(nested.length === 1 ? nested[0] : Filter.and(...nested))
        }
        continue
      }

      if (field === 'NOT') {
        const notFilter = this.negatedClauseToFilter(value as WhereClause<TDoc>)
        if (notFilter !== null) filters.push(notFilter)
        continue
      }

      const firestoreField = this.resolveField(field)

      if (isOperatorFilter(value)) {
        for (const [opKey, opVal] of Object.entries(value)) {
          if (opVal === undefined) continue
          filters.push(
            Filter.where(
              firestoreField,
              OPERATOR_MAP[opKey as keyof WhereOperatorFilter<unknown>],
              opVal,
            ),
          )
        }
      } else {
        filters.push(Filter.where(firestoreField, '==', value as unknown))
      }
    }

    if (filters.length === 0) return null
    return filters.length === 1 ? filters[0] : Filter.and(...filters)
  }

  private negatedClauseToFilter(where: WhereClause<TDoc>): Filter | null {
    const filters: Filter[] = []

    for (const [field, value] of Object.entries(where)) {
      if (
        value === undefined ||
        field === 'OR' ||
        field === 'AND' ||
        field === 'NOT'
      ) {
        continue
      }

      const firestoreField = this.resolveField(field)

      if (isOperatorFilter(value)) {
        for (const [opKey, opVal] of Object.entries(value)) {
          if (opVal === undefined) continue
          const negatedOp =
            NEGATED_OPERATOR_MAP[opKey as keyof WhereOperatorFilter<unknown>]
          if (negatedOp) {
            filters.push(Filter.where(firestoreField, negatedOp, opVal))
          }
        }
      } else {
        filters.push(Filter.where(firestoreField, '!=', value as unknown))
      }
    }

    if (filters.length === 0) return null
    return filters.length === 1 ? filters[0] : Filter.and(...filters)
  }

  /** Maps the `id` field to `FieldPath.documentId()` so Firestore queries work correctly. */
  private resolveField(field: string): string | FieldPath {
    return field === 'id' ? FieldPath.documentId() : field
  }
}
