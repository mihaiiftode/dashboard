"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { FooterBar, type FooterCounts, type SyncState } from "./footer-bar"

export type FooterStatus = {
  counts?: FooterCounts
  sync: SyncState
}

const connecting: FooterStatus = { sync: "connecting" }

const StatusContext = createContext<FooterStatus>(connecting)
const PublishContext = createContext<(status: FooterStatus) => void>(() => {})

export const FooterStatusProvider = ({ children }: { children: ReactNode }) => {
  const [status, setStatus] = useState(connecting)
  return (
    <PublishContext.Provider value={setStatus}>
      <StatusContext.Provider value={status}>{children}</StatusContext.Provider>
    </PublishContext.Provider>
  )
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
