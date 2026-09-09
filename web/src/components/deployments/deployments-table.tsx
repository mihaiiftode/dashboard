"use client"

import { memo, type ReactNode, useEffect, useMemo, useRef, useState } from "react"
import {
  columnGroupingFeature,
  createColumnHelper,
  createExpandedRowModel,
  createGroupedRowModel,
  type ExpandedState,
  rowExpandingFeature,
  rowSortingFeature,
  type SortingState,
  tableFeatures,
  useTable,
} from "@tanstack/react-table"
import { useVirtualizer } from "@tanstack/react-virtual"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronsUpDownIcon,
  TagIcon,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { notify } from "@/lib/notify"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { absoluteTime, daysLeft, relativeTime, shortId } from "@/lib/format"
import { isChipField, type Field, type Schema } from "@/lib/query/schema"
import type { Deployment, DeploymentType, Environment, Status } from "@/lib/types"
import { cn } from "@/lib/utils"
import { AttributesCell } from "./attributes-cell"
import { ChipEditCell } from "./chip-edit-cell"
import { EnvironmentTag, StatusBadge, TypeLabel } from "./facet-badges"
import { InlineEditCell, type ValueOption } from "./inline-edit-cell"
import { RowAction } from "./row-action"

const features = tableFeatures({
  rowSortingFeature,
  columnGroupingFeature,
  rowExpandingFeature,
  groupedRowModel: createGroupedRowModel(),
  expandedRowModel: createExpandedRowModel(),
})

const helper = createColumnHelper<typeof features, Deployment>()

const WIDTH: Record<string, string> = {
  id: "104px",
  name: "minmax(200px,1.6fr)",
  description: "minmax(240px,2fr)",
  status: "110px",
  type: "130px",
  env: "116px",
  version: "90px",
  creator: "minmax(180px,1.2fr)",
  created: "120px",
  deleted: "190px",
  attributes: "minmax(300px,2fr)",
  actions: "40px",
}
const ATTRIBUTE_WIDTH = "minmax(150px,1fr)"
const ROW_HEIGHT = 40

export type Sort = { key: string; desc: boolean } | null

type Actions = {
  pendingIds: ReadonlySet<string>
  onSetAttribute: (id: string, key: string, value: string) => void
  onDelete: (id: string) => void
  onRestore: (id: string) => void
}

type CellActions = Omit<Actions, "pendingIds"> & { isPending: (id: string) => boolean }

const FOCUS_RING = "focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"

function forwardPaddingClick(e: React.MouseEvent<HTMLTableCellElement>) {
  if (e.target !== e.currentTarget) return
  e.currentTarget
    .querySelector<HTMLButtonElement>(
      "button[title='Click to edit'], button[title^='Set '], button[title='Click to edit attributes']",
    )
    ?.click()
}

const OPTIONS_MAX = 40

function optionsFor(schema: Schema, key: string): ValueOption[] {
  const m = schema.distinct.get(key)
  if (!m || m.size > OPTIONS_MAX) return []
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, count }))
}

function TimeCell({ iso, extra }: { iso: string; extra?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            className={cn(
              "rounded-sm px-1 font-mono text-xs text-muted-foreground tabular-nums hover:bg-muted",
              FOCUS_RING,
            )}
          />
        }
      >
        {relativeTime(iso)}
        {extra && ` · ${extra}`}
      </TooltipTrigger>
      <TooltipContent>{absoluteTime(iso)}</TooltipContent>
    </Tooltip>
  )
}

function GroupValue({ field, value }: { field: Field; value: string }) {
  if (value === "") return <span className="text-muted-foreground italic">no {field.key}</span>
  if (field.key === "status") return <StatusBadge status={value as Status} />
  if (field.key === "type") return <TypeLabel type={value as DeploymentType} />
  if (field.key === "env") return <EnvironmentTag environment={value as Environment} />
  return <span className="font-mono text-sm">{value}</span>
}

function renderCell(field: Field, d: Deployment, a: CellActions, schema: Schema): ReactNode {
  const value = field.read(d)
  const readOnly = d.deleted_at !== null
  switch (field.key) {
    case "id":
      return (
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label={`Copy deployment ID ${d.deployment_id}`}
                className={cn(
                  "rounded-sm px-1 font-mono text-xs text-muted-foreground hover:bg-muted hover:text-foreground",
                  FOCUS_RING,
                )}
                onClick={(e) => {
                  e.stopPropagation()
                  copyId(d.deployment_id)
                }}
              />
            }
          >
            {shortId(d.deployment_id)}
          </TooltipTrigger>
          <TooltipContent className="font-mono">{d.deployment_id}</TooltipContent>
        </Tooltip>
      )
    case "status":
      return <StatusBadge status={d.status} />
    case "type":
      return <TypeLabel type={d.type} />
    case "env":
      return <EnvironmentTag environment={d.environment} />
    case "version":
      return <span className="font-mono text-xs tabular-nums">{d.version}</span>
    case "creator":
      return <span className="truncate font-mono text-xs text-muted-foreground">{d.created_by}</span>
    case "created":
      return <TimeCell iso={d.created_at} />
    case "deleted":
      return d.deleted_at === null ? null : <TimeCell iso={d.deleted_at} extra={`${daysLeft(d.deleted_at)}d left`} />
    default:
      if (isChipField(schema, field)) {
        return (
          <ChipEditCell
            keyName={field.key}
            value={value}
            options={optionsFor(schema, field.key)}
            pending={a.isPending(d.deployment_id)}
            readOnly={readOnly}
            onSave={(v) => a.onSetAttribute(d.deployment_id, field.key, v)}
          />
        )
      }
      return (
        <InlineEditCell
          value={value ?? ""}
          placeholder="—"
          pending={a.isPending(d.deployment_id)}
          readOnly={readOnly}
          mono={field.key === "oncall"}
          muted={field.key !== "name"}
          options={field.key === "name" || field.key === "description" ? undefined : optionsFor(schema, field.key)}
          onSave={(v) => a.onSetAttribute(d.deployment_id, field.key, v)}
        />
      )
  }
}

function copyId(id: string): void {
  navigator.clipboard
    .writeText(id)
    .then(() => notify.success({ title: "Deployment ID copied" }))
    .catch(() => notify.error({ title: "Copy failed", description: `Select and copy it manually: ${id}` }))
}

export const DeploymentsTable = memo(function DeploymentsTable({
  data,
  fields,
  schema,
  hiddenAttributeKeys,
  groupKey,
  sort,
  onSortChange,
  actions,
  onRangeChange,
}: {
  data: Deployment[]
  fields: Field[]
  schema: Schema
  hiddenAttributeKeys: string[]
  groupKey: string | null
  sort: Sort
  onSortChange: (next: Sort) => void
  actions: Actions
  onRangeChange: (start: number, end: number) => void
}) {
  const [expanded, setExpanded] = useState<ExpandedState>(true)
  const pendingRef = useRef(actions.pendingIds)
  pendingRef.current = actions.pendingIds
  const { onSetAttribute, onDelete, onRestore } = actions
  const cellActions = useMemo<CellActions>(
    () => ({ onSetAttribute, onDelete, onRestore, isPending: (id) => pendingRef.current.has(id) }),
    [onSetAttribute, onDelete, onRestore],
  )

  const columns = useMemo(
    () =>
      helper.columns([
        ...fields.map((field) =>
          helper.accessor((d) => field.read(d) ?? "", {
            id: field.key,
            header: () =>
              field.attribute ? (
                <span className="inline-flex items-center gap-1 font-mono normal-case">
                  <TagIcon className="size-3 opacity-60" aria-hidden />
                  {field.key}
                </span>
              ) : (
                field.label
              ),
            cell: ({ row }) => renderCell(field, row.original, cellActions, schema),
          }),
        ),
        ...(hiddenAttributeKeys.length > 0
          ? [
              helper.display({
                id: "attributes",
                header: () => (
                  <span className="inline-flex items-center gap-1">
                    <TagIcon className="size-3 opacity-60" aria-hidden />
                    Attributes
                  </span>
                ),
                cell: ({ row }) => (
                  <AttributesCell
                    deployment={row.original}
                    keys={hiddenAttributeKeys}
                    readOnly={row.original.deleted_at !== null}
                    onSet={(k, v) => cellActions.onSetAttribute(row.original.deployment_id, k, v)}
                  />
                ),
              }),
            ]
          : []),
        helper.display({
          id: "actions",
          header: () => <span className="sr-only">Actions</span>,
          cell: ({ row }) => (
            <RowAction
              deployment={row.original}
              onDelete={() => cellActions.onDelete(row.original.deployment_id)}
              onRestore={() => cellActions.onRestore(row.original.deployment_id)}
            />
          ),
        }),
      ]),
    [fields, cellActions, schema, hiddenAttributeKeys],
  )

  const grid = useMemo(
    () =>
      [
        ...fields.map((f) => WIDTH[f.key] ?? ATTRIBUTE_WIDTH),
        ...(hiddenAttributeKeys.length > 0 ? [WIDTH.attributes] : []),
        WIDTH.actions,
      ].join(" "),
    [fields, hiddenAttributeKeys],
  )
  const sorting: SortingState = useMemo(() => (sort ? [{ id: sort.key, desc: sort.desc }] : []), [sort])
  const groupField = fields.find((f) => f.key === groupKey) ?? null

  const table = useTable({
    features,
    columns,
    data,
    state: { sorting, expanded, grouping: groupField ? [groupField.key] : [] },
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(sorting) : updater
      onSortChange(next[0] ? { key: next[0].id, desc: next[0].desc } : null)
    },
    onExpandedChange: setExpanded,
    manualSorting: true,
    groupedColumnMode: false,
    autoResetExpanded: false,
  })

  const rows = table.getRowModel().rows
  const leafOrdinal = useMemo(() => {
    const out = new Array<number>(rows.length)
    let n = 0
    rows.forEach((r, i) => {
      if (!r.getIsGrouped()) n++
      out[i] = n
    })
    return out
  }, [rows])

  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 16,
  })
  const items = virtualizer.getVirtualItems()
  const firstIndex = items[0]?.index ?? 0
  const lastIndex = items[items.length - 1]?.index ?? -1
  useEffect(() => {
    if (lastIndex < 0) {
      onRangeChange(0, 0)
      return
    }
    const start = Math.max(1, leafOrdinal[firstIndex] + (rows[firstIndex].getIsGrouped() ? 1 : 0))
    onRangeChange(Math.min(start, leafOrdinal[lastIndex]), leafOrdinal[lastIndex])
  }, [firstIndex, lastIndex, leafOrdinal, rows, onRangeChange])

  return (
    <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-auto">
      <Table className="grid" style={{ minWidth: `${Math.max(1000, fields.length * 130)}px` }}>
        <TableHeader className="sticky top-0 z-10 grid bg-card">
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id} className="grid" style={{ gridTemplateColumns: grid }}>
              {group.headers.map((header) => {
                const sorted = header.column.getIsSorted()
                const canSort = header.column.getCanSort()
                return (
                  <TableHead
                    key={header.id}
                    aria-sort={
                      canSort ? (sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none") : undefined
                    }
                    className="group/head flex h-9 items-center px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase"
                  >
                    {header.isPlaceholder ? null : canSort ? (
                      <Button
                        variant="ghost"
                        size="xs"
                        className={cn("-ml-2 gap-1 text-xs tracking-wide uppercase", sorted && "text-foreground")}
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        <table.FlexRender header={header} />
                        {sorted === "asc" ? (
                          <ArrowUpIcon data-icon="inline-end" />
                        ) : sorted === "desc" ? (
                          <ArrowDownIcon data-icon="inline-end" />
                        ) : (
                          <ChevronsUpDownIcon
                            data-icon="inline-end"
                            className="opacity-0 group-focus-within/head:opacity-40 group-hover/head:opacity-40"
                          />
                        )}
                      </Button>
                    ) : (
                      <table.FlexRender header={header} />
                    )}
                  </TableHead>
                )
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody className="relative grid" style={{ height: virtualizer.getTotalSize() }}>
          {items.map((item) => {
            const row = rows[item.index]
            const style = { transform: `translateY(${item.start}px)`, height: ROW_HEIGHT, gridTemplateColumns: grid }
            if (row.getIsGrouped() && groupField) {
              return (
                <TableRow
                  key={row.id}
                  data-index={item.index}
                  className="absolute grid w-full items-center bg-muted/60 hover:bg-muted/60"
                  style={style}
                >
                  <TableCell className="flex items-center gap-2 px-2" style={{ gridColumn: "1 / -1" }}>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={row.getToggleExpandedHandler()}
                      aria-label={row.getIsExpanded() ? "Collapse group" : "Expand group"}
                      aria-expanded={row.getIsExpanded()}
                    >
                      {row.getIsExpanded() ? <ChevronDownIcon /> : <ChevronRightIcon />}
                    </Button>
                    <span className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
                      {groupField.key}
                    </span>
                    <GroupValue field={groupField} value={String(row.groupingValue ?? "")} />
                    <Badge variant="ghost" className="font-mono tabular-nums">
                      {row.subRows.length.toLocaleString()}
                    </Badge>
                  </TableCell>
                </TableRow>
              )
            }
            return (
              <TableRow
                key={row.id}
                data-index={item.index}
                className={cn("absolute grid w-full items-center", groupField && "pl-6")}
                style={style}
              >
                {row.getAllCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className="flex min-w-0 items-center overflow-hidden px-2 py-0"
                    onClick={forwardPaddingClick}
                  >
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
})
