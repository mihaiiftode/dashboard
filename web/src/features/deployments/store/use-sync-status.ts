"use client"

import { useSyncExternalStore } from "react"
import type { SyncSnapshot } from "./sync-tracker"
import { useDeploymentsStore } from "./store-context"

export const useSyncStatus = (): SyncSnapshot => {
  const store = useDeploymentsStore()
  return useSyncExternalStore(store.sync.subscribe, store.sync.snapshot, store.sync.snapshot)
}
