"use client"

import { memo, useEffect, useMemo, useState, type MouseEvent } from "react"
import { type ExpandedState, type SortingState, useTable } from "@tanstack/react-table"
import { useVirtualizer } from "@tanstack/react-virtual"
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { Deployment } from "../../store/schema"
import { cn } from "@/lib/utils"
import type { Field } from "../../query/schema"
import type { DeploymentColumns, DeploymentsTableMeta } from "./columns"
import { tableFeatures } from "./features"
import { GroupRow } from "./group-row"

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
const OVERSCAN = 16

export type Sort = { key: string; desc: boolean } | null

type DeploymentsTableProps = {
  rows: Deployment[]
  columns: DeploymentColumns
  fields: Field[]
  hasAttributesColumn: boolean
  pendingIds: ReadonlySet<string>
  groupKey: string | null
  sort: Sort
  onSortChange: (next: Sort) => void
  onRangeChange: (start: number, end: number) => void
}

export const DeploymentsTable = memo(
  ({
    rows,
    columns,
    fields,
    hasAttributesColumn,
    pendingIds,
    groupKey,
    sort,
    onSortChange,
    onRangeChange,
  }: DeploymentsTableProps) => {
    const [expanded, setExpanded] = useState<ExpandedState>(true)
    const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null)
    const grid = useMemo(
      () =>
        [
          ...fields.map((field) => WIDTH[field.key] ?? ATTRIBUTE_WIDTH),
          ...(hasAttributesColumn ? [WIDTH.attributes] : []),
          WIDTH.actions,
        ].join(" "),
      [fields, hasAttributesColumn],
    )
    const sorting: SortingState = useMemo(() => (sort ? [{ id: sort.key, desc: sort.desc }] : []), [sort])
    const groupField = fields.find((field) => field.key === groupKey) ?? null

    const meta = useMemo<DeploymentsTableMeta>(() => ({ pendingIds }), [pendingIds])
    const table = useTable({
      features: tableFeatures,
      columns,
      data: rows,
      meta,
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

    const tableRows = table.getRowModel().rows
    const leafOrdinals = useMemo(() => leafOrdinalsOf(tableRows), [tableRows])
    const virtualizer = useVirtualizer({
      count: tableRows.length,
      getScrollElement: () => scrollElement,
      estimateSize: () => ROW_HEIGHT,
      overscan: OVERSCAN,
    })
    const items = virtualizer.getVirtualItems()
    const firstIndex = items[0]?.index ?? 0
    const lastIndex = items[items.length - 1]?.index ?? -1
    useEffect(() => {
      if (lastIndex < 0) {
        onRangeChange(0, 0)
        return
      }
      const offset = tableRows[firstIndex].getIsGrouped() ? 1 : 0
      const start = Math.max(1, leafOrdinals[firstIndex] + offset)
      onRangeChange(Math.min(start, leafOrdinals[lastIndex]), leafOrdinals[lastIndex])
    }, [firstIndex, lastIndex, leafOrdinals, tableRows, onRangeChange])

    return (
      <div
        ref={setScrollElement}
        data-slot="table-scroller"
        role="region"
        tabIndex={0}
        aria-label="Deployments"
        className="relative min-h-0 flex-1 overflow-auto focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none [&_[data-slot=table-container]]:overflow-visible"
      >
        <Table
          className="grid"
          aria-rowcount={tableRows.length + 1}
          style={{ minWidth: `${Math.max(1000, fields.length * 130)}px` }}
        >
          <TableHeader className="sticky top-0 z-10 grid bg-card">
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id} aria-rowindex={1} className="grid" style={{ gridTemplateColumns: grid }}>
                {group.headers.map((header) => {
                  const sorted = header.column.getIsSorted()
                  const canSort = header.column.getCanSort()
                  return (
                    <TableHead
                      key={header.id}
                      aria-sort={canSort ? ariaSort(sorted) : undefined}
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
                          <SortIcon sorted={sorted} />
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
              const row = tableRows[item.index]
              const style = { transform: `translateY(${item.start}px)`, height: ROW_HEIGHT, gridTemplateColumns: grid }
              if (row.getIsGrouped() && groupField) {
                return (
                  <TableRow
                    key={row.id}
                    data-index={item.index}
                    aria-rowindex={item.index + 2}
                    className="absolute grid w-full items-center bg-muted/60 hover:bg-muted/60"
                    style={style}
                  >
                    <GroupRow
                      field={groupField}
                      value={String(row.groupingValue ?? "")}
                      count={row.subRows.length}
                      expanded={row.getIsExpanded()}
                      onToggle={row.getToggleExpandedHandler()}
                    />
                  </TableRow>
                )
              }
              return (
                <TableRow
                  key={row.id}
                  data-index={item.index}
                  aria-rowindex={item.index + 2}
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
  },
)

const SortIcon = ({ sorted }: { sorted: false | "asc" | "desc" }) => {
  if (sorted === "asc") return <ArrowUpIcon data-icon="inline-end" />
  if (sorted === "desc") return <ArrowDownIcon data-icon="inline-end" />
  return (
    <ChevronsUpDownIcon
      data-icon="inline-end"
      className="opacity-0 group-focus-within/head:opacity-40 group-hover/head:opacity-40"
    />
  )
}

const ariaSort = (sorted: false | "asc" | "desc") => {
  if (sorted === "asc") return "ascending"
  if (sorted === "desc") return "descending"
  return "none"
}

function forwardPaddingClick(event: MouseEvent<HTMLTableCellElement>) {
  if (event.target !== event.currentTarget) return
  event.currentTarget.querySelector<HTMLElement>("[data-slot='cell-editor']")?.click()
}

function leafOrdinalsOf(rows: readonly { getIsGrouped: () => boolean }[]): number[] {
  const ordinals = new Array<number>(rows.length)
  let leaves = 0
  rows.forEach((row, index) => {
    if (!row.getIsGrouped()) leaves++
    ordinals[index] = leaves
  })
  return ordinals
}
