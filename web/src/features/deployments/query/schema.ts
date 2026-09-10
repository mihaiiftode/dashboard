import type { Deployment } from "../store/schema"
import { FIXED_FIELDS, FieldKind, readFieldValue, type Field } from "./fields"

const ATTRIBUTE_ORDER = ["name", "description", "team", "region", "priority", "language", "framework", "oncall"]

export type Schema = {
  fields: Field[]
  byKey: Map<string, Field>
  attributeKeys: string[]
  attributeCounts: Map<string, number>
  distinct: Map<string, Map<string, number>>
  total: number
}

export function buildSchema(rows: Deployment[]): Schema {
  const counts = new Map<string, number>()
  for (const row of rows)
    for (const key of Object.keys(row.attributes))
      if (row.attributes[key] !== undefined) counts.set(key, (counts.get(key) ?? 0) + 1)
  const attributeKeys = [...counts.keys()].toSorted((a, b) => {
    const leftPriority = ATTRIBUTE_ORDER.indexOf(a)
    const rightPriority = ATTRIBUTE_ORDER.indexOf(b)
    if (leftPriority !== -1 || rightPriority !== -1)
      return (leftPriority === -1 ? Infinity : leftPriority) - (rightPriority === -1 ? Infinity : rightPriority)
    return (counts.get(b) ?? 0) - (counts.get(a) ?? 0)
  })
  const attributeFields: Field[] = attributeKeys.map((key) => ({
    key,
    label: key,
    kind: FieldKind.String,
    attribute: true,
  }))
  const fields = [...FIXED_FIELDS]
  fields.splice(1, 0, ...attributeFields.slice(0, 1))
  fields.push(...attributeFields.slice(1))
  const distinct = new Map<string, Map<string, number>>()
  for (const field of fields) {
    if (field.kind === FieldKind.Id || field.kind === FieldKind.Date) continue
    const values = new Map<string, number>()
    for (const row of rows) {
      const value = readFieldValue(field, row)
      if (value !== undefined) values.set(value, (values.get(value) ?? 0) + 1)
    }
    distinct.set(field.key, values)
  }
  return {
    fields,
    byKey: new Map(fields.map((field) => [field.key, field])),
    attributeKeys,
    attributeCounts: counts,
    distinct,
    total: rows.length,
  }
}
