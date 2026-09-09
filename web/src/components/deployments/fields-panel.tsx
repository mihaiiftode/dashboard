"use client"

import { useMemo, useState } from "react"
import { ChevronRightIcon, Columns3Icon, LayersIcon, RotateCcwIcon, SearchIcon, TagIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import type { Field, Schema } from "@/lib/query/schema"
import type { Deployment } from "@/lib/types"
import { cn } from "@/lib/utils"

const TOP = 5
const TOP_WHEN_SEARCHING = 8

type Counted = { value: string; count: number }

function countValues(field: Field, rows: Deployment[]): Counted[] {
  const m = new Map<string, number>()
  for (const d of rows) {
    const v = field.read(d)
    if (v !== undefined) m.set(v, (m.get(v) ?? 0) + 1)
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, count }))
}

function FieldRow({
  field,
  rows,
  search,
  visible,
  grouped,
  onToggleColumn,
  onGroup,
  onFilter,
}: {
  field: Field
  rows: Deployment[]
  search: string
  visible: boolean
  grouped: boolean
  onToggleColumn: () => void
  onGroup: () => void
  onFilter: (value: string) => void
}) {
  const [manualOpen, setManualOpen] = useState(false)
  const counted = useMemo(() => countValues(field, rows), [field, rows])
  const coverage = useMemo(() => counted.reduce((n, c) => n + c.count, 0), [counted])
  const keyHit = search !== "" && field.key.includes(search)
  const valueHits = useMemo(
    () => (search === "" ? [] : counted.filter((c) => c.value.toLowerCase().includes(search))),
    [counted, search],
  )
  if (search !== "" && !keyHit && valueHits.length === 0) return null
  const open = search !== "" ? valueHits.length > 0 || manualOpen : manualOpen
  const values = search !== "" && valueHits.length > 0 ? valueHits.slice(0, TOP_WHEN_SEARCHING) : counted.slice(0, TOP)
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
          {field.attribute && <TagIcon className="size-3 shrink-0 opacity-60" aria-hidden />}
          <span className="truncate">{field.key}</span>
          <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">{coverage.toLocaleString()}</span>
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
        {values.length === 0 && (
          <span className="px-1.5 text-xs text-muted-foreground">no values in current results</span>
        )}
        {values.map((v) => (
          <Button
            key={v.value}
            variant="ghost"
            size="xs"
            className="h-6 w-full justify-start gap-2 px-1.5 font-mono text-xs font-normal"
            title={`Filter ${field.key}: ${v.value}`}
            onClick={() => onFilter(v.value)}
          >
            <span className="min-w-0 flex-1 truncate text-left">{v.value}</span>
            <span className="text-[11px] text-muted-foreground tabular-nums">{v.count.toLocaleString()}</span>
            <span className="h-1 w-12 overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full bg-foreground/40"
                style={{ width: `${Math.round((v.count / Math.max(1, rows.length)) * 100)}%` }}
              />
            </span>
          </Button>
        ))}
      </CollapsibleContent>
    </Collapsible>
  )
}

export function FieldsPanel({
  schema,
  rows,
  visible,
  group,
  onToggleColumn,
  onGroup,
  onFilter,
  onResetColumns,
}: {
  schema: Schema
  rows: Deployment[]
  visible: ReadonlySet<string>
  group: string | null
  onToggleColumn: (key: string) => void
  onGroup: (key: string | null) => void
  onFilter: (key: string, value: string) => void
  onResetColumns: () => void
}) {
  const [search, setSearch] = useState("")
  const q = search.trim().toLowerCase()
  const fields = schema.fields.filter((f) => f.kind !== "id" && f.kind !== "date" && f.key !== "description")
  return (
    <aside className="flex w-72 shrink-0 flex-col border-l bg-card" aria-label="Fields">
      <div className="flex h-9 items-center justify-between px-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Fields
        <span className="font-mono normal-case tabular-nums">{rows.length.toLocaleString()} rows</span>
      </div>
      <div className="px-2 pb-2">
        <InputGroup>
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
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
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {fields.map((f) => (
          <FieldRow
            key={f.key}
            field={f}
            rows={rows}
            search={q}
            visible={visible.has(f.key)}
            grouped={group === f.key}
            onToggleColumn={() => onToggleColumn(f.key)}
            onGroup={() => onGroup(group === f.key ? null : f.key)}
            onFilter={(value) => onFilter(f.key, value)}
          />
        ))}
      </div>
    </aside>
  )
}
