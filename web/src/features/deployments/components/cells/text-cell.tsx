import { cn } from "@/lib/utils"

type TextCellProps = {
  value: string
  muted?: boolean
  truncate?: boolean
  tabular?: boolean
}

export const TextCell = ({ value, muted, truncate, tabular }: TextCellProps) => (
  <span
    data-slot="text-cell"
    className={cn(
      "font-mono text-xs",
      muted && "text-muted-foreground",
      truncate && "truncate",
      tabular && "tabular-nums",
    )}
  >
    {value}
  </span>
)
