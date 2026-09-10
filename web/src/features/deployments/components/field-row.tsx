"use client"

import { useState } from "react"
import { ChevronRightIcon, Columns3Icon, LayersIcon, TagIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import type { Field } from "../query/fields"
import { topValues, type ValueCount, type ValueIndex } from "../query/value-index"
import { cn } from "@/lib/utils"
import { FieldValues } from "./field-values"

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

type Shown = { open: boolean; values: readonly ValueCount[] }

const shownFor = (field: Field, index: ValueIndex, search: string, manualOpen: boolean): Shown | null => {
  if (search === "") return { open: manualOpen, values: topValues(index, "", TOP) }
  const hits = topValues(index, search, TOP_WHEN_SEARCHING)
  if (!field.key.includes(search) && hits.length === 0) return null
  return { open: hits.length > 0 || manualOpen, values: hits.length > 0 ? hits : topValues(index, "", TOP) }
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
  const shown = shownFor(field, index, search, manualOpen)
  if (!shown) return null
  return (
    <Collapsible open={shown.open} onOpenChange={setManualOpen}>
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
            className={cn("transition-transform motion-reduce:transition-none", shown.open && "rotate-90")}
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
        <FieldToggle
          on={visible}
          label={visible ? `Hide ${field.key} column` : `Show ${field.key} column`}
          onClick={onToggleColumn}
        >
          <Columns3Icon />
        </FieldToggle>
        <FieldToggle
          on={grouped}
          label={grouped ? `Stop grouping by ${field.key}` : `Group by ${field.key}`}
          onClick={onGroup}
        >
          <LayersIcon />
        </FieldToggle>
      </div>
      <CollapsibleContent className="flex flex-col gap-0.5 pb-1 pl-6">
        <FieldValues field={field} values={shown.values} total={total} onFilter={onFilter} />
      </CollapsibleContent>
    </Collapsible>
  )
}

type FieldToggleProps = { on: boolean; label: string; onClick: () => void; children: React.ReactNode }

const FieldToggle = ({ on, label, onClick, children }: FieldToggleProps) => (
  <Button
    variant="ghost"
    size="icon-xs"
    aria-label={label}
    aria-pressed={on}
    className={cn(!on && "text-muted-foreground/50")}
    onClick={onClick}
  >
    {children}
  </Button>
)
