import { Badge } from "@/components/ui/badge"
import type { Status } from "../../store/schema"
import { cn } from "@/lib/utils"

const STATUS_DOT: Record<Status, string> = {
  active: "bg-status-active",
  failed: "bg-status-failed",
  stopped: "bg-status-stopped",
}

export const StatusCell = ({ value }: { value: Status }) => (
  <Badge data-slot="status-cell" variant="outline" className="gap-1.5 font-mono text-[11px]">
    <span className={cn("size-1.5 rounded-full", STATUS_DOT[value])} aria-hidden />
    {value}
  </Badge>
)
