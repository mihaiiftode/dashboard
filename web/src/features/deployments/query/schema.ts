import type { Deployment } from "../store/schema"
import {
  attributeWidth,
  FIXED_FIELDS,
  RESERVED_KEYS,
  FieldKind,
  readFieldValue,
  type Field,
  type FieldCatalog,
} from "./fields"

const ATTRIBUTE_ORDER = ["name", "description", "team", "region", "priority", "language", "framework", "oncall"]
const ATTRIBUTE_RANK: ReadonlyMap<string, number> = new Map(ATTRIBUTE_ORDER.map((key, rank) => [key, rank]))

export type FieldStatistics = {
  attributeCounts: ReadonlyMap<string, number>
  distinct: ReadonlyMap<string, ReadonlyMap<string, number>>
  total: number
}

export const attributeCountsOf = (rows: readonly Deployment[]): ReadonlyMap<string, number> => {
  const counts = new Map<string, number>()
  for (const row of rows)
    for (const key of Object.keys(row.attributes))
      if (row.attributes[key] !== undefined) counts.set(key, (counts.get(key) ?? 0) + 1)
  return counts
}

export const attributeKeysOf = (counts: ReadonlyMap<string, number>): string[] =>
  [...counts.keys()]
    .filter((key) => !RESERVED_KEYS.has(key))
    .toSorted((a, b) => {
      const leftPriority = ATTRIBUTE_RANK.get(a) ?? Infinity
      const rightPriority = ATTRIBUTE_RANK.get(b) ?? Infinity
      if (leftPriority !== Infinity || rightPriority !== Infinity) return leftPriority - rightPriority
      return (counts.get(b) ?? 0) - (counts.get(a) ?? 0)
    })

export const catalogFor = (attributeKeys: readonly string[]): FieldCatalog => {
  const attributeFields: Field[] = attributeKeys.map((key) => ({
    key,
    label: key,
    kind: FieldKind.String,
    attribute: true,
    width: attributeWidth(key),
  }))
  const fields = [...FIXED_FIELDS]
  fields.splice(1, 0, ...attributeFields.slice(0, 1))
  fields.push(...attributeFields.slice(1))
  return { fields, byKey: new Map(fields.map((field) => [field.key, field])), attributeKeys }
}

export const statisticsFor = (
  rows: readonly Deployment[],
  catalog: FieldCatalog,
  attributeCounts: ReadonlyMap<string, number>,
): FieldStatistics => {
  const distinct = new Map<string, Map<string, number>>()
  for (const field of catalog.fields) {
    if (field.kind === FieldKind.Id || field.kind === FieldKind.Date) continue
    const values = new Map<string, number>()
    for (const row of rows) {
      const value = readFieldValue(field, row)
      if (value !== undefined) values.set(value, (values.get(value) ?? 0) + 1)
    }
    distinct.set(field.key, values)
  }
  return { attributeCounts, distinct, total: rows.length }
}
