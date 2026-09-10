import { ApiError } from "@/lib/api/http"
import { createLogger } from "@/lib/logger"
import type { RxReplicationWriteToMasterRow, WithDeleted } from "rxdb/plugins/core"
import type { DeploymentsApi } from "./api"
import { conflictBetween } from "./conflict"
import { writableOf, type Deployment } from "./schema"
import type { SyncTracker } from "./sync-tracker"

const log = createLogger("deployments", "replication")

const CLIENT_ERROR_FLOOR = 400
const SERVER_ERROR_FLOOR = 500
const RETRYABLE_STATUSES: ReadonlySet<number> = new Set([408, 425, 429])

export const pushRow = async (
  row: RxReplicationWriteToMasterRow<Deployment>,
  api: DeploymentsApi,
  tracker: SyncTracker,
): Promise<WithDeleted<Deployment> | null> => {
  const attempted = row.newDocumentState
  const master = row.assumedMasterState
  if (master === undefined) return null
  tracker.began(attempted.deployment_id)
  try {
    const settled =
      attempted.deleted_at === master.deleted_at
        ? await settleWrite(attempted, master, api)
        : await settleScope(attempted, api)
    if (settled.rejection === null) {
      const conflict = conflictBetween(attempted, settled.winner)
      if (conflict) {
        log.warning("write to {id} lost to a newer version", { id: attempted.deployment_id })
        tracker.conflicted(conflict)
      }
    } else {
      log.warning("write to {id} was rejected: {detail}", {
        id: attempted.deployment_id,
        detail: settled.rejection,
      })
      tracker.rejected({ deployment: settled.winner, detail: settled.rejection })
    }
    return { ...settled.winner, _deleted: false }
  } finally {
    tracker.settled(attempted.deployment_id)
  }
}

type SettledWrite = { winner: Deployment; rejection: string | null }

const settleScope = async (attempted: Deployment, api: DeploymentsApi): Promise<SettledWrite> => {
  try {
    if (attempted.deleted_at === null) return { winner: await api.restore(attempted.deployment_id), rejection: null }
    await api.remove(attempted.deployment_id)
    return { winner: await api.get(attempted.deployment_id), rejection: null }
  } catch (error) {
    if (!rejected(error)) throw error
    return { winner: await api.get(attempted.deployment_id), rejection: error.message }
  }
}

const settleWrite = async (attempted: Deployment, master: Deployment, api: DeploymentsApi): Promise<SettledWrite> => {
  try {
    const result = await api.replace({
      id: attempted.deployment_id,
      writable: writableOf(attempted),
      expectedRevision: master.revision,
    })
    return { winner: result.deployment, rejection: null }
  } catch (error) {
    if (!rejected(error)) throw error
    return { winner: await api.get(attempted.deployment_id), rejection: error.message }
  }
}

const rejected = (error: unknown): error is ApiError =>
  error instanceof ApiError &&
  error.status >= CLIENT_ERROR_FLOOR &&
  error.status < SERVER_ERROR_FLOOR &&
  !RETRYABLE_STATUSES.has(error.status)
