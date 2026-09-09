import { Skeleton } from "@/components/ui/skeleton"

export function TableSkeleton({ rows = 16 }: { rows?: number }) {
  return (
    <div className="flex flex-1 flex-col" role="status" aria-busy="true" aria-label="Loading deployments…">
      <div className="flex h-12 items-center gap-2 border-b px-4">
        <Skeleton className="h-8 w-[26rem]" />
        <Skeleton className="h-7 w-20" />
        <Skeleton className="h-7 w-20" />
        <Skeleton className="h-7 w-28" />
      </div>
      <div className="flex h-9 items-center gap-6 border-b px-4">
        {[220, 80, 90, 60, 60, 100, 160, 90].map((w, i) => (
          <Skeleton key={i} className="h-3" style={{ width: w }} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex h-10 items-center gap-6 border-b px-4">
          <Skeleton className="h-3.5 w-52" />
          <Skeleton className="h-5 w-16 rounded-4xl" />
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="h-4 w-12 rounded-4xl" />
          <Skeleton className="h-3.5 w-14" />
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-3.5 w-40" />
          <Skeleton className="h-3.5 w-16" />
        </div>
      ))}
    </div>
  )
}
