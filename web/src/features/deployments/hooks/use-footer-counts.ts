"use client"

import { useCallback, useMemo, useState } from "react"
import { usePublishFooterStatus, type FooterStatus } from "@/components/shell/footer-status"

export const useFooterCounts = (matched: number, total: number) => {
  const [range, setRange] = useState({ start: 0, end: 0 })
  usePublishFooterStatus(
    useMemo<FooterStatus>(
      () => ({ counts: { start: range.start, end: range.end, matched, total }, sync: "live" }),
      [range.start, range.end, matched, total],
    ),
  )
  return useCallback(
    (start: number, end: number) =>
      setRange((previous) => (previous.start === start && previous.end === end ? previous : { start, end })),
    [],
  )
}
