"use client"

import { Badge } from "@/components/ui/badge"
import { chipClass } from "@/lib/chip-color"
import { cn } from "@/lib/utils"

export function ValueChip({
  keyName,
  value,
  showKey = false,
  onEdit,
  className,
}: {
  keyName: string
  value: string
  showKey?: boolean
  onEdit?: () => void
  className?: string
}) {
  return (
    <Badge
      variant="outline"
      render={
        onEdit ? <button type="button" aria-label={`Edit ${keyName}: ${value}`} title="Click to edit" /> : undefined
      }
      className={cn(
        "h-5 min-w-0 max-w-72 shrink gap-1 border px-1.5 font-mono text-[11px]",
        chipClass(value),
        onEdit &&
          "cursor-text hover:brightness-110 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
        className,
      )}
      onClick={onEdit}
    >
      {showKey && <span className="shrink-0 font-semibold opacity-70">{keyName}:</span>}
      <span className="truncate">{value}</span>
    </Badge>
  )
}
