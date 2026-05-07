/** Base error for all ODM errors. Carries a machine-readable `code`. */
export class OdmError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
  ) {
    super(message)
    this.name = 'OdmError'
  }
}

/** Thrown when no document matches the given filter. */
export class NotFoundError extends OdmError {
  constructor(collection: string, where: object) {
    super(
      `No document found in "${collection}" matching ${JSON.stringify(where)}`,
      'NOT_FOUND',
    )
    this.name = 'NotFoundError'
  }
}

/** Thrown when a query is attempted before `createOdmClient` / `init()` has been called. */
export class UninitializedError extends OdmError {
  constructor() {
    super(
      '`createOdmClient` or `init()` must be called before running queries',
      'UNINITIALIZED',
    )
    this.name = 'UninitializedError'
  }
}
