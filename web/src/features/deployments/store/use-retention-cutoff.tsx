"use client"

import { createContext, use, useEffect, useState, type ReactNode } from "react"
import { RETENTION_DAYS } from "@/lib/format"
import { retentionCutoff } from "../query/compile"
import type { Deployment } from "./schema"

const DAY_MS = 86_400_000
const MAX_TIMEOUT_MS = 2_147_483_647

const SeededCutoffContext = createContext<number | null>(null)

export const RetentionCutoffProvider = ({ cutoff, children }: { cutoff: number; children: ReactNode }) => (
  <SeededCutoffContext.Provider value={cutoff}>{children}</SeededCutoffContext.Provider>
)

export const useRetentionCutoff = (rows: readonly Deployment[]): number => {
  const seeded = use(SeededCutoffContext)
  const [cutoff, setCutoff] = useState(() => seeded ?? retentionCutoff())

  useEffect(() => {
    const deadline = nearestDeadline(rows, cutoff)
    if (deadline === null) return
    const wait = Math.min(Math.max(deadline - Date.now(), 0), MAX_TIMEOUT_MS)
    const timer = window.setTimeout(() => setCutoff(retentionCutoff()), wait)
    return () => window.clearTimeout(timer)
  }, [rows, cutoff])

  return cutoff
}

const nearestDeadline = (rows: readonly Deployment[], cutoff: number): number | null => {
  let nearest = Number.POSITIVE_INFINITY
  for (const row of rows) {
    if (row.deleted_at === null) continue
    const deletedAt = Date.parse(row.deleted_at)
    if (deletedAt > cutoff && deletedAt < nearest) nearest = deletedAt
  }
  return Number.isFinite(nearest) ? nearest + RETENTION_DAYS * DAY_MS : null
}
