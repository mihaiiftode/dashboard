"use client"

import type { ReactNode } from "react"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import { CELL_TRIGGER_CLASS } from "./use-cell-editing"

export type CellTriggerProps = {
  editLabel: string
  hint: string
  readOnly?: boolean
  pending?: boolean
  className?: string
  onStart: () => void
  children: ReactNode
}

export const CellTrigger = ({ editLabel, hint, readOnly, pending, className, onStart, children }: CellTriggerProps) => (
  <button
    type="button"
    data-slot="cell-editor"
    onClick={onStart}
    disabled={readOnly}
    aria-label={editLabel}
    title={readOnly ? undefined : hint}
    className={cn(CELL_TRIGGER_CLASS, className)}
  >
    {children}
    {pending ? <Spinner className="size-3 shrink-0 text-muted-foreground" /> : null}
  </button>
)
