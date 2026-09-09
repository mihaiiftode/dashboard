import { cn } from "@/lib/utils"

export type FooterCounts = {
  start: number
  end: number
  matched: number
  total: number
}

export type SyncState = "connecting" | "live"

type FooterBarProps = {
  counts?: FooterCounts
  sync: SyncState
}

type FooterLabels = {
  window: string | null
  matched: string
  total: string | null
}

const placeholderLabels: FooterLabels = { window: "rows — of ", matched: "—", total: null }

const labelsFor = (counts: FooterCounts): FooterLabels => ({
  window: counts.matched === 0 ? null : `rows ${counts.start.toLocaleString()}–${counts.end.toLocaleString()} of `,
  matched: counts.matched === 0 ? "0 rows" : counts.matched.toLocaleString(),
  total: counts.matched === counts.total ? null : `${counts.total.toLocaleString()} total`,
})

export const FooterBar = ({ counts, sync }: FooterBarProps) => {
  const labels = counts ? labelsFor(counts) : placeholderLabels
  return (
    <footer
      data-slot="footer-bar"
      className="flex h-8 shrink-0 items-center gap-4 border-t bg-card px-4 font-mono text-xs text-muted-foreground tabular-nums"
    >
      <span data-slot="footer-window">
        {labels.window}
        <span role="status" aria-live="polite">
          {labels.matched}
        </span>
      </span>
      {labels.total ? <span data-slot="footer-total">{labels.total}</span> : null}
      <span data-slot="footer-sync" className="ml-auto flex items-center gap-2">
        <SyncDot sync={sync} />
        {sync}
      </span>
    </footer>
  )
}

const SyncDot = ({ sync }: { sync: SyncState }) => (
  <span className="relative flex size-1.5">
    {sync === "live" ? (
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-live opacity-60 motion-reduce:hidden" />
    ) : null}
    <span
      className={cn("relative inline-flex size-1.5 rounded-full", sync === "live" ? "bg-live" : "bg-muted-foreground")}
    />
  </span>
)
