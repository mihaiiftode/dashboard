import { Badge } from "@/components/ui/badge"
import type { Environment } from "@/lib/types"

export const EnvironmentCell = ({ value }: { value: Environment }) => (
  <Badge
    data-slot="environment-cell"
    variant={value === "production" ? "secondary" : "ghost"}
    className="font-mono text-[11px]"
  >
    {value}
  </Badge>
)
