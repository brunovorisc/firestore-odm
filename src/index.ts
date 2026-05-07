export type { OdmInitOptions } from '@/lib/firebase'
export { getDb, initFirebase } from '@/lib/firebase'
// Exported so subclasses can be initialized by OdmClient.
// Symbol keys prevent accidental calls — they don't appear in IDE autocomplete.
export {
  $asBatch,
  $asTransaction,
  $setDb,
  BaseRepository,
} from '@/repositories/base-repository'
export { BatchRepository } from '@/repositories/batch-repository'
export { QueryBuilder } from '@/repositories/query-builder'
export { TransactionRepository } from '@/repositories/transaction-repository'
export * from '@/repositories/types'
export { snapshotsToDocs, snapshotToDoc } from '@/utils/converters'
export { NotFoundError, OdmError, UninitializedError } from '@/utils/errors'
export { withCreateTimestamps, withUpdateTimestamp } from '@/utils/timestamps'
export { isWhereById } from '@/utils/where'

export type { OdmBatchContext, OdmTransactionContext } from './client'
export { createOdmClient, OdmClient } from './client'
