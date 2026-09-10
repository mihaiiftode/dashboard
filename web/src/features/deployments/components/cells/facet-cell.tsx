import type { ReactNode } from "react"
import { environmentSchema, statusSchema, typeSchema } from "../../store/schema"
import { EnvironmentCell } from "./environment-cell"
import { StatusCell } from "./status-cell"
import { TypeCell } from "./type-cell"

const FACET_CELL: Record<string, (value: string) => ReactNode> = {
  status: (value) => {
    const status = statusSchema.safeParse(value)
    return status.success ? <StatusCell value={status.data} /> : null
  },
  type: (value) => {
    const type = typeSchema.safeParse(value)
    return type.success ? <TypeCell value={type.data} /> : null
  },
  env: (value) => {
    const environment = environmentSchema.safeParse(value)
    return environment.success ? <EnvironmentCell value={environment.data} /> : null
  },
}

export const facetCell = (key: string, value: string): ReactNode => FACET_CELL[key]?.(value) ?? null
