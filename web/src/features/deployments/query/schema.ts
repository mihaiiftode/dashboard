import type { Deployment } from "../store/schema"

export type FieldKind = "enum" | "string" | "date" | "id"

export type Field = {
  key: string
  label: string
  kind: FieldKind
  attribute: boolean
  read: (d: Deployment) => string | undefined
  normalize?: (v: string) => string
}

const ENV_ALIASES: Record<string, string> = { prod: "production", stage: "staging", dev: "development" }
const TYPE_ALIASES: Record<string, string> = {
  web: "web_service",
  service: "web_service",
  cron: "cron_job",
  job: "cron_job",
}

const FIXED: Field[] = [
  { key: "id", label: "ID", kind: "id", attribute: false, read: (d) => d.deployment_id },
  { key: "status", label: "Status", kind: "enum", attribute: false, read: (d) => d.status },
  {
    key: "type",
    label: "Type",
    kind: "enum",
    attribute: false,
    read: (d) => d.type,
    normalize: (v) => TYPE_ALIASES[v.toLowerCase()] ?? v.toLowerCase(),
  },
  {
    key: "env",
    label: "Env",
    kind: "enum",
    attribute: false,
    read: (d) => d.environment,
    normalize: (v) => ENV_ALIASES[v.toLowerCase()] ?? v.toLowerCase(),
  },
  { key: "version", label: "Version", kind: "string", attribute: false, read: (d) => d.version },
  { key: "creator", label: "Creator", kind: "string", attribute: false, read: (d) => d.created_by },
  { key: "created", label: "Created", kind: "date", attribute: false, read: (d) => d.created_at },
  { key: "deleted", label: "Deleted", kind: "date", attribute: false, read: (d) => d.deleted_at ?? undefined },
]

const ALIASES: Record<string, string> = {
  environment: "env",
  created_by: "creator",
  deployment_id: "id",
  created_at: "created",
  deleted_at: "deleted",
}

export const ATTRIBUTE_ORDER = ["name", "description", "team", "region", "priority", "language", "framework", "oncall"]

export type Schema = {
  fields: Field[]
  byKey: Map<string, Field>
  attributeKeys: string[]
  attributeCounts: Map<string, number>
  distinct: Map<string, Map<string, number>>
  total: number
}

const CHIP_MAX_DISTINCT = 12
const PROMOTE_COVERAGE = 0.33
export const FIXED_VISIBLE = ["id", "status", "type", "env", "version", "creator", "created"]

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

export function buildSchema(rows: Deployment[]): Schema {
  const counts = new Map<string, number>()
  for (const d of rows)
    for (const k of Object.keys(d.attributes))
      if (d.attributes[k] !== undefined) counts.set(k, (counts.get(k) ?? 0) + 1)
  const attributeKeys = [...counts.keys()].sort((a, b) => {
    const ia = ATTRIBUTE_ORDER.indexOf(a)
    const ib = ATTRIBUTE_ORDER.indexOf(b)
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
    return (counts.get(b) ?? 0) - (counts.get(a) ?? 0)
  })
  const attributeFields: Field[] = attributeKeys.map((key) => ({
    key,
    label: key,
    kind: "string",
    attribute: true,
    read: (d) => d.attributes[key],
  }))
  const fields = [...FIXED.slice(0, 1), attributeFields[0], ...FIXED.slice(1), ...attributeFields.slice(1)].filter(
    Boolean,
  ) as Field[]
  const distinct = new Map<string, Map<string, number>>()
  for (const f of fields) {
    if (f.kind === "id" || f.kind === "date") continue
    const m = new Map<string, number>()
    for (const d of rows) {
      const v = f.read(d)
      if (v !== undefined) m.set(v, (m.get(v) ?? 0) + 1)
    }
    distinct.set(f.key, m)
  }
  return {
    fields,
    byKey: new Map(fields.map((f) => [f.key, f])),
    attributeKeys,
    attributeCounts: counts,
    distinct,
    total: rows.length,
  }
}

const UNGROUPABLE_KINDS: FieldKind[] = ["id", "date"]

export function groupCandidates(schema: Schema): Field[] {
  return schema.fields.filter((field) => !UNGROUPABLE_KINDS.includes(field.kind) && field.key !== "description")
}

export function resolveKey(schema: Schema, raw: string): Field | undefined {
  const k = raw.toLowerCase()
  return schema.byKey.get(ALIASES[k] ?? k)
}

export type ValueOption = { value: string; count: number }

const OPTIONS_MAX = 40

export function optionsFor(schema: Schema, key: string): ValueOption[] {
  const values = schema.distinct.get(key)
  if (!values || values.size > OPTIONS_MAX) return []
  return [...values.entries()].sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, count }))
}
