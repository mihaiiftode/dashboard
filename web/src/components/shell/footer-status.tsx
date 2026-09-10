"use client"

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react"
import { FooterBar, type FooterCounts, type SyncState } from "./footer-bar"

export type FooterStatus = {
  counts?: FooterCounts
  sync: SyncState
}

export type VisibleRange = { start: number; end: number }

const connecting: FooterStatus = { sync: "connecting" }
const nothingVisible: VisibleRange = { start: 0, end: 0 }

const StatusContext = createContext<FooterStatus>(connecting)
const PublishContext = createContext<(status: FooterStatus) => void>(() => {})
const RangeContext = createContext<VisibleRange>(nothingVisible)
const PublishRangeContext = createContext<(range: VisibleRange) => void>(() => {})

export const FooterStatusProvider = ({ children }: { children: ReactNode }) => {
  const [status, setStatus] = useState(connecting)
  const [range, setRange] = useState(nothingVisible)
  const publishRange = useCallback(
    (next: VisibleRange) =>
      setRange((previous) => (previous.start === next.start && previous.end === next.end ? previous : next)),
    [],
  )
  return (
    <PublishContext.Provider value={setStatus}>
      <PublishRangeContext.Provider value={publishRange}>
        <RangeContext.Provider value={range}>
          <StatusContext.Provider value={status}>{children}</StatusContext.Provider>
        </RangeContext.Provider>
      </PublishRangeContext.Provider>
    </PublishContext.Provider>
  )
}

export const useVisibleRange = () => useContext(RangeContext)

export const usePublishVisibleRange = (range: VisibleRange) => {
  const publish = useContext(PublishRangeContext)
  useEffect(() => {
    publish(range)
  }, [publish, range])
}

export const StatusFooter = () => {
  const status = useContext(StatusContext)
  return <FooterBar counts={status.counts} sync={status.sync} />
}

export const usePublishFooterStatus = (status: FooterStatus) => {
  const publish = useContext(PublishContext)
  useEffect(() => {
    publish(status)
    return () => publish(connecting)
  }, [publish, status])
}
