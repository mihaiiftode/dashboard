"use client"

import { RotateCcwIcon, Trash2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { Deployment } from "@/lib/types"
import { cn } from "@/lib/utils"

export function RowAction({
  deployment,
  onDelete,
  onRestore,
}: {
  deployment: Deployment
  onDelete: () => void
  onRestore: () => void
}) {
  const deleted = deployment.deleted_at !== null
  const label = deleted ? "Restore" : "Delete"
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            className={cn("text-muted-foreground", deleted ? "hover:text-foreground" : "hover:text-destructive")}
            aria-label={`${label} ${deployment.attributes.name}`}
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
