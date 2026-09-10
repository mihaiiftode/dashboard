import { cn } from "@/lib/utils"
import { nothingVisible, type VisibleRange } from "./visible-range"

export type FooterCounts = {
  matched: number
  total: number
}

export type SyncState = "connecting" | "live" | "reconnecting" | "offline"

type FooterBarProps = {
  counts?: FooterCounts
  range?: VisibleRange
  sync: SyncState
}

type FooterLabels = {
  window: string | null
  matched: string
  total: string | null
}

const placeholderLabels: FooterLabels = { window: "rows — of ", matched: "—", total: null }

const labelsFor = (counts: FooterCounts, range: VisibleRange): FooterLabels => ({
  window: counts.matched === 0 ? null : `rows ${range.start.toLocaleString()}–${range.end.toLocaleString()} of `,
  matched: counts.matched === 0 ? "0 rows" : counts.matched.toLocaleString(),
  total: counts.matched === counts.total ? null : `${counts.total.toLocaleString()} total`,
})

export const FooterBar = ({ counts, range = nothingVisible, sync }: FooterBarProps) => {
  const labels = counts ? labelsFor(counts, range) : placeholderLabels
  return (
    <footer
      data-slot="footer-bar"
      className="flex h-8 shrink-0 items-center gap-4 border-t bg-card px-4 font-mono text-xs text-muted-foreground tabular-nums"
    >
      <span data-slot="footer-window">
        {labels.window}
        <output aria-live="polite" aria-label="Matched deployments">
          {labels.matched}
        </output>
      </span>
      {labels.total ? <span data-slot="footer-total">{labels.total}</span> : null}
      <output
        data-slot="footer-sync"
        aria-live="polite"
        aria-label={`Connection ${sync}`}
        className={cn("ml-auto flex items-center gap-2", sync === "offline" && "text-destructive")}
      >
        <SyncDot sync={sync} />
        {sync}
      </output>
    </footer>
  )
}

const DOT_CLASS: Record<SyncState, string> = {
  connecting: "bg-muted-foreground",
  live: "bg-live",
  reconnecting: "bg-muted-foreground",
  offline: "bg-destructive",
}

const SyncDot = ({ sync }: { sync: SyncState }) => (
  <span className="relative flex size-1.5">
    {sync === "live" ? (
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-live opacity-60 motion-reduce:hidden" />
    ) : null}
    <span className={cn("relative inline-flex size-1.5 rounded-full", DOT_CLASS[sync])} />
  </span>
)
