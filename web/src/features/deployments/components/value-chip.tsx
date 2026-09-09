import { Badge } from "@/components/ui/badge"
import { chipClass } from "@/lib/chip-color"
import { cn } from "@/lib/utils"

type ValueChipProps = {
  keyName: string
  value: string
  showKey?: boolean
  className?: string
}

export const ValueChip = ({ keyName, value, showKey = false, className }: ValueChipProps) => (
  <Badge
    data-slot="value-chip"
    variant="outline"
    className={cn("h-5 min-w-0 max-w-72 shrink gap-1 border px-1.5 font-mono text-[11px]", chipClass(value), className)}
  >
    {showKey ? <span className="shrink-0 font-semibold opacity-70">{keyName}:</span> : null}
    <span className="truncate">{value}</span>
  </Badge>
)
