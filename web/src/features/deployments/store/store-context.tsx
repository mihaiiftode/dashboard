"use client"

import { createContext, startTransition, use, useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { env } from "@/lib/env"
import { createLogger } from "@/lib/logger"
import { createFetchDeploymentsApi, type DeploymentsApi } from "./api"
import { createDeploymentsStore, type DeploymentsStore, type StoreOptions, type StoreSeed } from "./create-store"

const log = createLogger("deployments", "store")

type StoreState =
  | { status: "loading" }
  | { status: "ready"; store: DeploymentsStore }
  | { status: "error"; error: Error }

type StoreContextValue = StoreState & { retry: () => void }

const StoreContext = createContext<StoreContextValue>({ status: "loading", retry: () => {} })

export type DeploymentsStoreProviderProps = {
  api?: DeploymentsApi
  databaseName?: string
  seed?: StoreSeed
  children: ReactNode
}

export const DeploymentsStoreProvider = ({ api, databaseName, seed, children }: DeploymentsStoreProviderProps) => {
  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => setAttempt((previous) => previous + 1), [])
  return (
    <OpenStore key={attempt} api={api} databaseName={databaseName} seed={seed} retry={retry}>
      {children}
    </OpenStore>
  )
}

type OpenStoreProps = DeploymentsStoreProviderProps & { retry: () => void }

let released: Promise<unknown> = Promise.resolve()

const settle = async (work: Promise<unknown>): Promise<void> => {
  try {
    await work
  } catch (cause) {
    log.debug("previous store release failed: {message}", { message: String(cause) })
  }
}

const openAfter = async (previous: Promise<unknown>, options: StoreOptions): Promise<DeploymentsStore> => {
  await settle(previous)
  return createDeploymentsStore(options)
}

const releaseWhenOpen = async (opening: Promise<DeploymentsStore>): Promise<void> => {
  try {
    const store = await opening
    await store.destroy()
  } catch (cause) {
    log.debug("store released without opening: {message}", { message: String(cause) })
  }
}

const OpenStore = ({ api, databaseName, seed, retry, children }: OpenStoreProps) => {
  const [state, setState] = useState<StoreState>({ status: "loading" })

  useEffect(() => {
    let abandoned = false
    const opening = openAfter(released, {
      api: api ?? createFetchDeploymentsApi(env.NEXT_PUBLIC_API_URL),
      databaseName,
      seed,
    })
    const show = async () => {
      try {
        const store = await opening
        if (!abandoned) startTransition(() => setState({ status: "ready", store }))
      } catch (cause) {
        const error = cause as Error
        log.error("store failed to open: {message}", { message: error.message })
        if (!abandoned) setState({ status: "error", error })
      }
    }
    void show()
    return () => {
      abandoned = true
      released = releaseWhenOpen(opening)
    }
  }, [api, databaseName, seed])

  const value = useMemo<StoreContextValue>(() => ({ ...state, retry }), [state, retry])
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export const useDeploymentsStoreState = () => use(StoreContext)

export const useDeploymentsStore = (): DeploymentsStore => {
  const state = use(StoreContext)
  if (state.status !== "ready") throw new Error("useDeploymentsStore used outside a ready store")
  return state.store
}

export const useDeploymentsCollection = () => useDeploymentsStore().collection
