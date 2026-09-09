import { Skeleton } from "@/components/ui/skeleton"

const HEADERS = [
  { id: "name", width: 220 },
  { id: "status", width: 80 },
  { id: "type", width: 90 },
  { id: "env", width: 60 },
  { id: "version", width: 60 },
  { id: "creator", width: 100 },
  { id: "description", width: 160 },
  { id: "created", width: 90 },
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
  <div className="flex flex-1 flex-col" role="status" aria-busy="true" aria-label="Loading deployments…">
    <div className="flex h-12 items-center gap-2 border-b px-4">
      <Skeleton className="h-8 w-[26rem]" />
      <Skeleton className="h-7 w-20" />
      <Skeleton className="h-7 w-20" />
      <Skeleton className="h-7 w-28" />
    </div>
    <div className="flex h-9 items-center gap-6 border-b px-4">
      {HEADERS.map((header) => (
        <Skeleton key={header.id} className="h-3" style={{ width: header.width }} />
      ))}
    </div>
    {rowKeys(rows).map((rowKey) => (
      <div key={rowKey} className="flex h-10 items-center gap-6 border-b px-4">
        {CELLS.map((cell) => (
          <Skeleton key={cell.id} className={cell.className} />
        ))}
      </div>
    ))}
  </div>
)

const rowKeys = (count: number) => Array.from({ length: count }, (_, index) => `skeleton-row-${index}`)
