import { ApiError } from "@/lib/api/http"
import { createLogger } from "@/lib/logger"
import type { RxReplicationWriteToMasterRow, WithDeleted } from "./rxdb"
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
  acknowledged = new Map<string, Deployment>(),
): Promise<WithDeleted<Deployment> | null> => {
  const attempted = row.newDocumentState
  const master = row.assumedMasterState
  if (master === undefined || attempted._deleted) return null
  tracker.began(attempted.deployment_id)
  const known = acknowledged.get(attempted.deployment_id) ?? master
  const settled =
    attempted.deleted_at === known.deleted_at
      ? await settleWrite(attempted, master, api, acknowledged)
      : await settleScope(attempted, api, acknowledged)
  if (settled.rejection === null && settled.winner !== null) {
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
    tracker.rejected({
      deployment: settled.winner ?? attempted,
      detail: settled.rejection ?? "Deployment no longer exists",
    })
  }
  const superseded = !tracker.settled(attempted.deployment_id, attempted)
  if (settled.winner === null) return { ...attempted, _deleted: true }
  return superseded ? null : { ...settled.winner, _deleted: false }
}

type SettledWrite = { winner: Deployment | null; rejection: string | null }

const winningDocument = async (id: string, api: DeploymentsApi): Promise<Deployment | null> => {
  try {
    return await api.get(id)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

const settleScope = async (
  attempted: Deployment,
  api: DeploymentsApi,
  acknowledged: Map<string, Deployment>,
): Promise<SettledWrite> => {
  try {
    const winner = await changedScope(attempted, api)
    acknowledged.set(attempted.deployment_id, winner)
    return { winner, rejection: null }
  } catch (error) {
    if (!rejected(error)) throw error
    acknowledged.delete(attempted.deployment_id)
    return { winner: await winningDocument(attempted.deployment_id, api), rejection: error.message }
  }
}

const changedScope = async (attempted: Deployment, api: DeploymentsApi): Promise<Deployment> => {
  if (attempted.deleted_at === null) return api.restore(attempted.deployment_id)
  await api.remove(attempted.deployment_id)
  return api.get(attempted.deployment_id)
}

const settleWrite = async (
  attempted: Deployment,
  master: Deployment,
  api: DeploymentsApi,
  acknowledged: Map<string, Deployment>,
): Promise<SettledWrite> => {
  try {
    const previous = acknowledged.get(attempted.deployment_id)
    const expectedRevision = previous && previous.revision > master.revision ? previous.revision : master.revision
    const result = await api.replace({
      id: attempted.deployment_id,
      writable: writableOf(attempted),
      expectedRevision,
    })
    if (result.outcome === "written") acknowledged.set(attempted.deployment_id, result.deployment)
    else acknowledged.delete(attempted.deployment_id)
    return { winner: result.deployment, rejection: null }
  } catch (error) {
    if (!rejected(error)) throw error
    return { winner: await winningDocument(attempted.deployment_id, api), rejection: error.message }
  }
}

const rejected = (error: unknown): error is ApiError =>
  error instanceof ApiError &&
  error.status >= CLIENT_ERROR_FLOOR &&
  error.status < SERVER_ERROR_FLOOR &&
  !RETRYABLE_STATUSES.has(error.status)
