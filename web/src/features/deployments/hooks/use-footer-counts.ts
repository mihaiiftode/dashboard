"use client"

import { useMemo } from "react"
import type { SyncState } from "@/components/shell/footer-bar"
import { usePublishFooterStatus, useVisibleRange, type FooterStatus } from "@/components/shell/footer-status"

export const useFooterCounts = (matched: number, total: number, sync: SyncState) => {
  const range = useVisibleRange()
  usePublishFooterStatus(
    useMemo<FooterStatus>(
      () => ({ counts: { start: range.start, end: range.end, matched, total }, sync }),
      [range.start, range.end, matched, total, sync],
    ),
  )
}
