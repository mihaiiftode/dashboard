import { Skeleton } from "@/components/ui/skeleton"

const HEADERS = [
  { id: "name", className: "h-3 w-55" },
  { id: "status", className: "h-3 w-20" },
  { id: "type", className: "h-3 w-22.5" },
  { id: "env", className: "h-3 w-15" },
  { id: "version", className: "h-3 w-15" },
  { id: "creator", className: "h-3 w-25" },
  { id: "description", className: "h-3 w-40" },
  { id: "created", className: "h-3 w-22.5" },
]
const CELLS = [
  { id: "name", className: "h-3.5 w-52" },
  { id: "status", className: "h-5 w-16 rounded-4xl" },
  { id: "type", className: "h-3.5 w-20" },
  { id: "env", className: "h-4 w-12 rounded-4xl" },
  { id: "version", className: "h-3.5 w-14" },
  { id: "creator", className: "h-3.5 w-24" },
  { id: "description", className: "h-3.5 w-40" },
  { id: "created", className: "h-3.5 w-16" },
]

export const TableSkeleton = ({ rows = 16 }: { rows?: number }) => (
  <output className="flex flex-1 flex-col" aria-busy="true" aria-label="Loading deployments…">
    <div className="flex h-12 items-center gap-2 border-b px-4">
      <Skeleton className="h-8 w-104" />
      <Skeleton className="h-7 w-20" />
      <Skeleton className="h-7 w-20" />
      <Skeleton className="h-7 w-28" />
    </div>
    <div className="flex h-9 items-center gap-6 border-b px-4">
      {HEADERS.map((header) => (
        <Skeleton key={header.id} className={header.className} />
      ))}
    </div>
    {rowKeys(rows).map((rowKey) => (
      <div key={rowKey} className="flex h-10 items-center gap-6 border-b px-4">
        {CELLS.map((cell) => (
          <Skeleton key={cell.id} className={cell.className} />
        ))}
      </div>
    ))}
  </output>
)

const rowKeys = (count: number) => Array.from({ length: count }, (_, index) => `skeleton-row-${index}`)
