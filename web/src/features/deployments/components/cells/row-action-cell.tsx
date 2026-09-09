"use client"

import { RotateCcwIcon, Trash2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

type RowActionCellProps = {
  name: string
  deleted: boolean
  onDelete: () => void
  onRestore: () => void
}

export const RowActionCell = ({ name, deleted, onDelete, onRestore }: RowActionCellProps) => {
  const label = deleted ? "Restore" : "Delete"
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            className={cn("text-muted-foreground", deleted ? "hover:text-foreground" : "hover:text-destructive")}
            aria-label={`${label} ${name}`}
            onClick={deleted ? onRestore : onDelete}
          />
        }
      >
        {deleted ? <RotateCcwIcon /> : <Trash2Icon />}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
