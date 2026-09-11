import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { absoluteTime, relativeTime } from "@/lib/format"
import { cn } from "@/lib/utils"

type TimeCellProps = {
  iso: string
  suffix?: string
}

export const TimeCell = ({ iso, suffix }: TimeCellProps) => {
  const absolute = absoluteTime(iso)
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            data-slot="time-detail"
            aria-label={absolute}
            className={cn(
              "rounded-sm px-1 font-mono text-xs text-muted-foreground tabular-nums hover:bg-muted",
              "focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
            )}
          />
        }
      >
        {relativeTime(iso)}
        {suffix ? ` · ${suffix}` : null}
      </TooltipTrigger>
      <TooltipContent>{absolute}</TooltipContent>
    </Tooltip>
  )
}
