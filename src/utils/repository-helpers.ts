type DocWithOptionalId = Record<string, unknown> & { id?: string }

/** Merges `defaults` with `data`, with `data` fields taking precedence. */
export function applyDefaults(
  defaults: Record<string, unknown>,
  data: Record<string, unknown>,
): Record<string, unknown> {
  return { ...defaults, ...data }
}

/** Splits `id` out of a data object so it can be used as the document id. */
export function extractDocData(data: Record<string, unknown>): {
  id?: string
  data: Record<string, unknown>
} {
  const { id, ...rest } = data as DocWithOptionalId
  return { id, data: rest }
}
