"use client"

import { useCallback, useMemo, useState } from "react"
import type { SyncState } from "@/components/shell/footer-bar"
import { usePublishFooterStatus, type FooterStatus } from "@/components/shell/footer-status"

export const useFooterCounts = (matched: number, total: number, sync: SyncState) => {
  const [range, setRange] = useState({ start: 0, end: 0 })
  usePublishFooterStatus(
    useMemo<FooterStatus>(
      () => ({ counts: { start: range.start, end: range.end, matched, total }, sync }),
      [range.start, range.end, matched, total, sync],
    ),
  )
  return useCallback(
    (start: number, end: number) =>
      setRange((previous) => (previous.start === start && previous.end === end ? previous : { start, end })),
    [],
  )
}
