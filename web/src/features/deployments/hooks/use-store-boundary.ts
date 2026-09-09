"use client"

import { useDeploymentsStoreState } from "../store/store-context"

export type StoreBoundary = {
  loading: boolean
  error: Error | null
  ready: boolean
  onRetry: () => void
}

export const useStoreBoundary = (): StoreBoundary => {
  const state = useDeploymentsStoreState()
  return {
    loading: state.status === "loading",
    error: state.status === "error" ? state.error : null,
    ready: state.status === "ready",
    onRetry: state.retry,
  }
}
