import { FieldKind, type Field } from "../../query/fields"
import type { Schema } from "../../query/schema"

const CHIP_MAX_DISTINCT = 12
const PROMOTE_COVERAGE = 0.33
const FIXED_VISIBLE = ["id", "status", "type", "env", "version", "creator", "created"]

export function isChipField(schema: Schema, field: Field): boolean {
  if (!field.attribute || field.key === "name" || field.key === "description") return false
  const values = schema.distinct.get(field.key)
  return values !== undefined && values.size > 0 && values.size <= CHIP_MAX_DISTINCT
}

export function defaultVisible(schema: Schema): string[] {
  const promoted = schema.attributeKeys.filter(
    (k) => (schema.attributeCounts.get(k) ?? 0) / Math.max(1, schema.total) >= PROMOTE_COVERAGE,
  )
  return [...FIXED_VISIBLE, ...promoted]
}

const UNGROUPABLE_KINDS = new Set<FieldKind>([FieldKind.Id, FieldKind.Date])

export function groupCandidates(schema: Schema): Field[] {
  return schema.fields.filter((field) => !UNGROUPABLE_KINDS.has(field.kind) && field.key !== "description")
}

export type ValueOption = { value: string; count: number }

const OPTIONS_MAX = 40

export function optionsFor(schema: Schema, key: string): ValueOption[] {
  const values = schema.distinct.get(key)
  if (!values || values.size > OPTIONS_MAX) return []
  return [...values.entries()].toSorted((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, count }))
}
