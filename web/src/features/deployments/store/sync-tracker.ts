import type { WriteConflict } from "./conflict"

export type SyncSnapshot = {
  pendingIds: ReadonlySet<string>
  conflict: WriteConflict | null
}

export type SyncStatus = {
  subscribe: (listener: () => void) => () => void
  snapshot: () => SyncSnapshot
}

export type SyncTracker = SyncStatus & {
  began: (deploymentId: string) => void
  settled: (deploymentId: string) => void
  conflicted: (conflict: WriteConflict) => void
}

export const createSyncTracker = (): SyncTracker => {
  const pending = new Set<string>()
  const listeners = new Set<() => void>()
  let snapshot: SyncSnapshot = { pendingIds: new Set(), conflict: null }

  const publish = (conflict: SyncSnapshot["conflict"]) => {
    snapshot = { pendingIds: new Set(pending), conflict }
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
      publish(snapshot.conflict)
    },
    settled: (deploymentId) => {
      pending.delete(deploymentId)
      publish(snapshot.conflict)
    },
    conflicted: (conflict) => publish(conflict),
  }
}
