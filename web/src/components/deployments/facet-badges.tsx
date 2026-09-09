import { BoxIcon, ClockIcon, CogIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { DeploymentType, Environment, Status } from "@/lib/types"
import { cn } from "@/lib/utils"

const STATUS_DOT: Record<Status, string> = {
  active: "bg-status-active",
  failed: "bg-status-failed",
  stopped: "bg-status-stopped",
}

export function StatusBadge({ status }: { status: Status }) {
  return (
    <Badge variant="outline" className="gap-1.5 font-mono text-[11px]">
      <span className={cn("size-1.5 rounded-full", STATUS_DOT[status])} aria-hidden />
      {status}
    </Badge>
  )
}

const TYPE_ICON: Record<DeploymentType, typeof BoxIcon> = {
  web_service: BoxIcon,
  worker: CogIcon,
  cron_job: ClockIcon,
}

export function TypeLabel({ type }: { type: DeploymentType }) {
  const Icon = TYPE_ICON[type]
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-xs">
      <Icon className="size-3.5 text-muted-foreground" aria-hidden />
      {type}
    </span>
  )
}

export function EnvironmentTag({ environment }: { environment: Environment }) {
  return (
    <Badge variant={environment === "production" ? "secondary" : "ghost"} className="font-mono text-[11px]">
      {environment}
    </Badge>
  )
}
