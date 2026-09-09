export function FooterBar({
  start,
  end,
  matched,
  total,
}: {
  start: number
  end: number
  matched: number
  total: number
}) {
  return (
    <div className="flex h-8 shrink-0 items-center gap-4 border-t bg-card px-4 font-mono text-xs text-muted-foreground tabular-nums">
      <span>
        {matched === 0 ? null : `rows ${start.toLocaleString()}–${end.toLocaleString()} of `}
        <span role="status" aria-live="polite">
          {matched.toLocaleString()} {matched === 0 ? "rows" : ""}
        </span>
      </span>
      {matched !== total && <span>{total.toLocaleString()} total</span>}
      <span className="ml-auto flex items-center gap-2">
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-live opacity-60 motion-reduce:hidden" />
          <span className="relative inline-flex size-1.5 rounded-full bg-live" />
        </span>
        live
      </span>
    </div>
  )
}
