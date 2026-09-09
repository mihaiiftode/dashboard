"use client"

import { useState } from "react"

export const CELL_TRIGGER_CLASS =
  "flex h-7 w-full min-w-0 items-center gap-1.5 rounded-sm px-1.5 text-left hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none"

export const useCellEditing = (value: string, onCommit: (next: string) => void) => {
  const [editing, setEditing] = useState(false)
  return {
    editing,
    start: () => setEditing(true),
    cancel: () => setEditing(false),
    commit: (next: string) => {
      setEditing(false)
      if (next !== value) onCommit(next)
    },
  }
}
