import { FieldKind, type Field, type FieldCatalog } from "../../query/fields"
import type { FieldStatistics } from "../../query/schema"

const CHIP_MAX_DISTINCT = 12
const PROMOTE_COVERAGE = 0.33
const FIXED_VISIBLE = ["id", "status", "type", "env", "version", "creator", "created"]

export function isChipField(statistics: FieldStatistics, field: Field): boolean {
  if (!field.attribute || field.key === "name" || field.key === "description") return false
  const values = statistics.distinct.get(field.key)
  return values !== undefined && values.size > 0 && values.size <= CHIP_MAX_DISTINCT
}

export function defaultVisible(catalog: FieldCatalog, statistics: FieldStatistics): string[] {
  const promoted = catalog.attributeKeys.filter(
    (k) => (statistics.attributeCounts.get(k) ?? 0) / Math.max(1, statistics.total) >= PROMOTE_COVERAGE,
  )
  return [...FIXED_VISIBLE, ...promoted]
}

const UNGROUPABLE_KINDS = new Set<FieldKind>([FieldKind.Id, FieldKind.Date])

export function groupCandidates(catalog: FieldCatalog): Field[] {
  return catalog.fields.filter((field) => !UNGROUPABLE_KINDS.has(field.kind) && field.key !== "description")
}

export type ValueOption = { value: string; count: number }

const OPTIONS_MAX = 40

export function optionsFor(statistics: FieldStatistics, key: string): ValueOption[] {
  const values = statistics.distinct.get(key)
  if (!values || values.size > OPTIONS_MAX) return []
  return [...values.entries()].toSorted((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, count }))
}
