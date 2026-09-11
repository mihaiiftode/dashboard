import {
  attributeCountsOf,
  attributeKeysOf,
  catalogFor,
  statisticsFor,
  type FieldStatistics,
} from "@/features/deployments/query/schema"
import type { FieldCatalog } from "@/features/deployments/query/fields"
import type { Deployment } from "@/features/deployments/store/schema"

export function buildSchema(rows: readonly Deployment[]): { catalog: FieldCatalog; statistics: FieldStatistics } {
  const attributeCounts = attributeCountsOf(rows)
  const catalog = catalogFor(attributeKeysOf(attributeCounts))
  return { catalog, statistics: statisticsFor(rows, catalog, attributeCounts) }
}
