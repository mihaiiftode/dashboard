import type { DeploymentType, Environment, Status } from "../../store/schema"
import { EnvironmentCell } from "./environment-cell"
import { StatusCell } from "./status-cell"
import { TypeCell } from "./type-cell"

export const FACET_KEYS = ["status", "type", "env"] as const

export const facetCell = (key: string, value: string) => {
  if (key === "status") return <StatusCell value={value as Status} />
  if (key === "type") return <TypeCell value={value as DeploymentType} />
  if (key === "env") return <EnvironmentCell value={value as Environment} />
  return null
}
