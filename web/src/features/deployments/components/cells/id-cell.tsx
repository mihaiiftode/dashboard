import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { shortId } from "@/lib/format"
import { cn } from "@/lib/utils"

type IdCellProps = {
  value: string
  onCopy: (id: string) => void
}

export const IdCell = ({ value, onCopy }: IdCellProps) => (
  <Tooltip>
    <TooltipTrigger
      render={
        <button
          type="button"
          aria-label={`Copy deployment ID ${value}`}
          className={cn(
            "rounded-sm px-1 font-mono text-xs text-muted-foreground hover:bg-muted hover:text-foreground",
            "focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
          )}
          onClick={(event) => {
            event.stopPropagation()
            onCopy(value)
          }}
        />
      }
    >
      {shortId(value)}
    </TooltipTrigger>
    <TooltipContent className="font-mono">{value}</TooltipContent>
  </Tooltip>
)
