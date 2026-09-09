"use client"

import type { ReactNode } from "react"
import { Columns3Icon, LayersIcon, RotateCcwIcon, SearchIcon, TagIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"

type FieldsPanelProps = {
  total: number
  search: string
  onSearchChange: (next: string) => void
  onResetColumns: () => void
  children: ReactNode
}

export const FieldsPanel = ({ total, search, onSearchChange, onResetColumns, children }: FieldsPanelProps) => (
  <aside className="flex w-72 shrink-0 flex-col border-l bg-card" aria-label="Fields">
    <div className="flex h-9 items-center justify-between px-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
      Fields
      <span className="font-mono normal-case tabular-nums">{total.toLocaleString()} rows</span>
    </div>
    <div className="px-2 pb-2">
      <InputGroup>
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Find a field or value…"
          aria-label="Find a field or value"
          autoComplete="off"
          spellCheck={false}
          className="h-7 font-mono text-xs"
        />
      </InputGroup>
    </div>
    <div className="flex items-center gap-2 px-3 pb-2 text-[11px] text-muted-foreground">
      <span className="flex items-center gap-1">
        <Columns3Icon className="size-3" /> column
      </span>
      <span className="flex items-center gap-1">
        <LayersIcon className="size-3" /> group
      </span>
      <span className="flex items-center gap-1">
        <TagIcon className="size-3" /> attribute
      </span>
      <Button
        variant="ghost"
        size="xs"
        className="ml-auto h-6 text-[11px] text-muted-foreground"
        onClick={onResetColumns}
      >
        <RotateCcwIcon data-icon="inline-start" />
        Reset
      </Button>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">{children}</div>
  </aside>
)
