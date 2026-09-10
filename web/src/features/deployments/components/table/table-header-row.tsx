import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from "lucide-react"
import type * as React from "react"
import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"

type SortDirection = "asc" | "desc" | "none"
type Sorted = false | "asc" | "desc"

type HeaderLike = {
  id: string
  isPlaceholder: boolean
  column: {
    getIsSorted: () => Sorted
    getCanSort: () => boolean
    getToggleSortingHandler: () => ((event: React.MouseEvent<HTMLButtonElement>) => void) | undefined
  }
}

type HeaderTable<H extends HeaderLike> = {
  getHeaderGroups: () => { id: string; headers: H[] }[]
  FlexRender: (props: { header: H }) => ReactNode
}

export const TableHeaderRow = <H extends HeaderLike>({ table, grid }: { table: HeaderTable<H>; grid: string }) => (
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
)

const directionOf = (sorted: Sorted): SortDirection => (sorted === false ? "none" : sorted)

const SORT_ICON: Record<SortDirection, () => ReactNode> = {
  asc: () => <ArrowUpIcon data-icon="inline-end" />,
  desc: () => <ArrowDownIcon data-icon="inline-end" />,
  none: () => (
    <ChevronsUpDownIcon
      data-icon="inline-end"
      className="opacity-0 group-focus-within/head:opacity-40 group-hover/head:opacity-40"
    />
  ),
}

const ARIA_SORT: Record<SortDirection, "ascending" | "descending" | "none"> = {
  asc: "ascending",
  desc: "descending",
  none: "none",
}

const SortIcon = ({ sorted }: { sorted: Sorted }) => SORT_ICON[directionOf(sorted)]()

const ariaSort = (sorted: Sorted) => ARIA_SORT[directionOf(sorted)]
