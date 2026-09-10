"use client"

import { useMemo } from "react"
import type { SyncState } from "@/components/shell/footer-bar"
import { usePublishFooterStatus, type FooterStatus } from "@/components/shell/footer-status"

export const useFooterCounts = (matched: number, total: number, sync: SyncState) => {
  usePublishFooterStatus(useMemo<FooterStatus>(() => ({ counts: { matched, total }, sync }), [matched, total, sync]))
}
