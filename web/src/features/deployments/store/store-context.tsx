"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { env } from "@/lib/env"
import { createLogger } from "@/lib/logger"
import { createFetchDeploymentsApi, type DeploymentsApi } from "./api"
import { createDeploymentsStore, type DeploymentsStore } from "./create-store"

const log = createLogger("deployments", "store")

export type StoreState =
  | { status: "loading" }
  | { status: "ready"; store: DeploymentsStore }
  | { status: "error"; error: Error }

type StoreContextValue = StoreState & { retry: () => void }

const StoreContext = createContext<StoreContextValue>({ status: "loading", retry: () => undefined })

export type DeploymentsStoreProviderProps = {
  api?: DeploymentsApi
  databaseName?: string
  children: ReactNode
}

export const DeploymentsStoreProvider = ({ api, databaseName, children }: DeploymentsStoreProviderProps) => {
  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => setAttempt((previous) => previous + 1), [])
  return (
    <OpenStore key={attempt} api={api} databaseName={databaseName} retry={retry}>
      {children}
    </OpenStore>
  )
}

type OpenStoreProps = DeploymentsStoreProviderProps & { retry: () => void }

const OpenStore = ({ api, databaseName, retry, children }: OpenStoreProps) => {
  const [state, setState] = useState<StoreState>({ status: "loading" })

  useEffect(() => {
    let opened: DeploymentsStore | null = null
    let abandoned = false
    createDeploymentsStore({ api: api ?? createFetchDeploymentsApi(env.NEXT_PUBLIC_API_URL), databaseName })
      .then((store) => {
        opened = store
        if (abandoned) return store.destroy()
        setState({ status: "ready", store })
        return undefined
      })
      .catch((error: Error) => {
        log.error("store failed to open: {message}", { message: error.message })
        if (!abandoned) setState({ status: "error", error })
      })
    return () => {
      abandoned = true
      void opened?.destroy()
    }
  }, [api, databaseName])

  const value = useMemo<StoreContextValue>(() => ({ ...state, retry }), [state, retry])
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export const useDeploymentsStoreState = () => useContext(StoreContext)

export const useDeploymentsStore = (): DeploymentsStore => {
  const state = useContext(StoreContext)
  if (state.status !== "ready") throw new Error("useDeploymentsStore used outside a ready store")
  return state.store
}

export const useDeploymentsCollection = () => useDeploymentsStore().collection
