"use client"

import { useState } from "react"
import { ChevronRightIcon, Columns3Icon, LayersIcon, TagIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import type { Field } from "../query/fields"
import { topValues, type ValueIndex } from "../query/value-index"
import { cn } from "@/lib/utils"

const TOP = 5
const TOP_WHEN_SEARCHING = 8

export type FieldRowProps = {
  field: Field
  index: ValueIndex
  search: string
  total: number
  visible: boolean
  grouped: boolean
  onToggleColumn: () => void
  onGroup: () => void
  onFilter: (value: string) => void
}

export const FieldRow = ({
  field,
  index,
  search,
  total,
  visible,
  grouped,
  onToggleColumn,
  onGroup,
  onFilter,
}: FieldRowProps) => {
  const [manualOpen, setManualOpen] = useState(false)
  const keyHit = search !== "" && field.key.includes(search)
  const hits = search === "" ? [] : topValues(index, search, TOP_WHEN_SEARCHING)
  if (search !== "" && !keyHit && hits.length === 0) return null
  const open = search === "" ? manualOpen : hits.length > 0 || manualOpen
  const values = hits.length > 0 ? hits : topValues(index, "", TOP)
  return (
    <Collapsible open={open} onOpenChange={setManualOpen}>
      <div className="flex h-8 items-center gap-1 rounded-sm pr-1 hover:bg-muted">
        <CollapsibleTrigger
          render={
            <Button
              variant="ghost"
              size="xs"
              className="min-w-0 flex-1 justify-start gap-1.5 px-1.5 font-mono text-xs"
            />
          }
        >
          <ChevronRightIcon
            data-icon="inline-start"
            className={cn("transition-transform motion-reduce:transition-none", open && "rotate-90")}
          />
          {field.attribute ? <TagIcon className="size-3 shrink-0 opacity-60" aria-hidden /> : null}
          <span className="truncate">{field.key}</span>
          <span
            className="ml-auto text-[11px] text-muted-foreground tabular-nums"
            aria-label={`${index.covered.toLocaleString()} rows`}
          >
            {index.covered.toLocaleString()}
          </span>
        </CollapsibleTrigger>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={visible ? `Hide ${field.key} column` : `Show ${field.key} column`}
          aria-pressed={visible}
          className={cn(!visible && "text-muted-foreground/50")}
          onClick={onToggleColumn}
        >
          <Columns3Icon />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={grouped ? `Stop grouping by ${field.key}` : `Group by ${field.key}`}
          aria-pressed={grouped}
          className={cn(!grouped && "text-muted-foreground/50")}
          onClick={onGroup}
        >
          <LayersIcon />
        </Button>
      </div>
      <CollapsibleContent className="flex flex-col gap-0.5 pb-1 pl-6">
        {values.length === 0 ? (
          <span className="px-1.5 text-xs text-muted-foreground">no values in current results</span>
        ) : null}
        {values.map((entry) => (
          <Button
            key={entry.value}
            variant="ghost"
            size="xs"
            className="h-6 w-full justify-start gap-2 px-1.5 font-mono text-xs font-normal"
            aria-label={`Filter ${field.key}: ${entry.value}`}
            onClick={() => onFilter(entry.value)}
          >
            <span className="min-w-0 flex-1 truncate text-left">{entry.value}</span>
            <span className="text-[11px] text-muted-foreground tabular-nums">{entry.rows.toLocaleString()}</span>
            <span className="h-1 w-12 overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full bg-foreground/40"
                style={{ width: `${Math.round((entry.rows / Math.max(1, total)) * 100)}%` }}
              />
            </span>
          </Button>
        ))}
      </CollapsibleContent>
    </Collapsible>
  )
}
