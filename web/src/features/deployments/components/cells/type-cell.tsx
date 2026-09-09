import { BoxIcon, ClockIcon, CogIcon } from "lucide-react"
import type { DeploymentType } from "@/lib/types"

const TYPE_ICON: Record<DeploymentType, typeof BoxIcon> = {
  web_service: BoxIcon,
  worker: CogIcon,
  cron_job: ClockIcon,
}

export const TypeCell = ({ value }: { value: DeploymentType }) => {
  const Icon = TYPE_ICON[value]
  return (
    <span data-slot="type-cell" className="inline-flex items-center gap-1.5 font-mono text-xs">
      <Icon className="size-3.5 text-muted-foreground" aria-hidden />
      {value}
    </span>
  )
}
