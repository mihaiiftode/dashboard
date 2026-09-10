"use client"

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react"
import { FooterBar, type FooterCounts, type SyncState } from "./footer-bar"
import { createVisibleRangeStore, nothingVisible, type VisibleRange, type VisibleRangeStore } from "./visible-range"

export type FooterStatus = {
  counts?: FooterCounts
  sync: SyncState
}

export type { VisibleRange }

const connecting: FooterStatus = { sync: "connecting" }

const StatusContext = createContext<FooterStatus>(connecting)
const PublishContext = createContext<(status: FooterStatus) => void>(() => {})
const RangeStoreContext = createContext<VisibleRangeStore | null>(null)

export const FooterStatusProvider = ({ children }: { children: ReactNode }) => {
  const [status, setStatus] = useState(connecting)
  const [rangeStore] = useState(createVisibleRangeStore)
  return (
    <PublishContext.Provider value={setStatus}>
      <RangeStoreContext.Provider value={rangeStore}>
        <StatusContext.Provider value={status}>{children}</StatusContext.Provider>
      </RangeStoreContext.Provider>
    </PublishContext.Provider>
  )
}

const useRangeStore = (): VisibleRangeStore | null => useContext(RangeStoreContext)

export const usePublishVisibleRange = (range: VisibleRange) => {
  const store = useRangeStore()
  useEffect(() => {
    store?.publish(range)
  }, [store, range])
}

const readNothing = () => nothingVisible

const useVisibleRange = (): VisibleRange => {
  const store = useRangeStore()
  return useSyncExternalStore(store?.subscribe ?? noSubscription, store?.snapshot ?? readNothing, readNothing)
}

const noSubscription = () => () => {}

export const StatusFooter = () => {
  const status = useContext(StatusContext)
  const range = useVisibleRange()
  return <FooterBar counts={status.counts} range={range} sync={status.sync} />
}

export const usePublishFooterStatus = (status: FooterStatus) => {
  const publish = useContext(PublishContext)
  useEffect(() => {
    publish(status)
    return () => publish(connecting)
  }, [publish, status])
}
