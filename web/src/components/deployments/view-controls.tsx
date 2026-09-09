"use client"

import { PanelRightIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

export function FieldsToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <Button variant={open ? "secondary" : "outline"} size="sm" aria-pressed={open} onClick={onToggle}>
      <PanelRightIcon data-icon="inline-start" />
      Fields
    </Button>
  )
}
