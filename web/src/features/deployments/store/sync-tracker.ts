import { differencesBetween, type WriteConflict } from "./conflict"
import type { Deployment } from "./schema"

type ConnectionState = "connecting" | "live" | "reconnecting" | "offline"

export type WriteRejection = { deployment: Deployment; detail: string }

export type SyncSnapshot = {
  pendingIds: ReadonlySet<string>
  conflict: WriteConflict | null
  rejection: WriteRejection | null
  connection: ConnectionState
}

export type SyncStatus = {
  subscribe: (listener: () => void) => () => void
  snapshot: () => SyncSnapshot
}

export type SyncTracker = SyncStatus & {
  began: (deploymentId: string) => void
  queued: (deployment: Deployment) => void
  settled: (deploymentId: string, attempted?: Deployment) => boolean
  conflicted: (conflict: WriteConflict) => void
  rejected: (rejection: WriteRejection) => void
  connectionChanged: (connection: ConnectionState) => void
}

export const createSyncTracker = (): SyncTracker => {
  const pending = new Set<string>()
  const queued = new Map<string, Deployment>()
  const listeners = new Set<() => void>()
  let snapshot: SyncSnapshot = {
    pendingIds: new Set(),
    conflict: null,
    rejection: null,
    connection: "connecting",
  }

  const publish = (next: Partial<SyncSnapshot>) => {
    snapshot = { ...snapshot, pendingIds: new Set(pending), ...next }
    for (const listener of listeners) listener()
  }

  return {
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    snapshot: () => snapshot,
    began: (deploymentId) => {
      pending.add(deploymentId)
      publish({})
    },
    queued: (deployment) => {
      queued.set(deployment.deployment_id, deployment)
      pending.add(deployment.deployment_id)
      publish({})
    },
    settled: (deploymentId, attempted) => {
      const latest = queued.get(deploymentId)
      if (
        latest &&
        attempted &&
        (latest.deleted_at !== attempted.deleted_at || differencesBetween(latest, attempted).length > 0)
      )
        return false
      queued.delete(deploymentId)
      pending.delete(deploymentId)
      publish({})
      return true
    },
    conflicted: (conflict) => publish({ conflict }),
    rejected: (rejection) => publish({ rejection }),
    connectionChanged: (connection) => publish({ connection }),
  }
}
