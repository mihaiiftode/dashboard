"use client"

import { PanelRightIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

export const FieldsToggle = ({ open, onToggle }: { open: boolean; onToggle: () => void }) => (
  <Button variant={open ? "secondary" : "outline"} size="sm" aria-pressed={open} onClick={onToggle}>
    <PanelRightIcon data-icon="inline-start" />
    Fields
  </Button>
)
