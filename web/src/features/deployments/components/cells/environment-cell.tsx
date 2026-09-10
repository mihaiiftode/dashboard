import { Badge } from "@/components/ui/badge"
import type { Environment } from "../../store/schema"

const VARIANT_OF: Record<Environment, "secondary" | "ghost"> = {
  production: "secondary",
  staging: "ghost",
  development: "ghost",
}

export const EnvironmentCell = ({ value }: { value: Environment }) => (
  <Badge data-slot="environment-cell" variant={VARIANT_OF[value]} className="font-mono text-[11px]">
    {value}
  </Badge>
)
