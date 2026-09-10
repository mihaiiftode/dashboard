"use client"

import { XIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { QueryChip } from "../query/chips"

export type QueryChipsProps = {
  chips: readonly QueryChip[]
  onClear: () => void
}

export const QueryChips = ({ chips, onClear }: QueryChipsProps) => {
  if (chips.length === 0) return null
  return (
    <div data-slot="query-chips" className="flex flex-wrap items-center gap-1.5 border-b bg-background px-4 py-1.5">
      {chips.map((chip) => (
        <ChipBadge key={chip.key} chip={chip} />
      ))}
      <Button variant="link" size="xs" onClick={onClear}>
        Clear
      </Button>
    </div>
  )
}

const ChipBadge = ({ chip }: { chip: QueryChip }) => {
  const badge = (
    <Badge data-slot="query-chip" variant={chip.variant} className="gap-1 pr-1 font-mono text-[11px]">
      {chip.label}
      <Button
        variant="ghost"
        size="icon-xs"
        className="size-4"
        aria-label={`Remove ${chip.label}`}
        onClick={chip.onRemove}
      >
        <XIcon />
      </Button>
    </Badge>
  )
  return chip.issue ? (
    <Tooltip>
      <TooltipTrigger render={<span />}>{badge}</TooltipTrigger>
      <TooltipContent>{chip.issue}</TooltipContent>
    </Tooltip>
  ) : (
    badge
  )
}
