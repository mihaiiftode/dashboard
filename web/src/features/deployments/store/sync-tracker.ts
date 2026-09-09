import type { WriteConflict } from "./conflict"
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
  settled: (deploymentId: string) => void
  conflicted: (conflict: WriteConflict) => void
  rejected: (rejection: WriteRejection) => void
  connectionChanged: (connection: ConnectionState) => void
}

export const createSyncTracker = (): SyncTracker => {
  const pending = new Set<string>()
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
    settled: (deploymentId) => {
      pending.delete(deploymentId)
      publish({})
    },
    conflicted: (conflict) => publish({ conflict }),
    rejected: (rejection) => publish({ rejection }),
    connectionChanged: (connection) => publish({ connection }),
  }
}
