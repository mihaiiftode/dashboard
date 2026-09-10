import type { Deployment } from "../store/schema"

export enum FieldKind {
  Enum = "enum",
  String = "string",
  Date = "date",
  Id = "id",
}

export type FieldCatalog = {
  fields: readonly Field[]
  byKey: ReadonlyMap<string, Field>
  attributeKeys: readonly string[]
}

type StoredColumn = Exclude<keyof Deployment, "attributes" | "revision">

export type Field = {
  key: string
  label: string
  kind: FieldKind
  aliases?: Readonly<Record<string, string>>
} & ({ attribute: true } | { attribute: false; column: StoredColumn })

const ENV_ALIASES: Record<string, string> = { prod: "production", stage: "staging", dev: "development" }
const TYPE_ALIASES: Record<string, string> = {
  web: "web_service",
  service: "web_service",
  cron: "cron_job",
  job: "cron_job",
}

export const FIXED_FIELDS: Field[] = [
  { key: "id", label: "ID", kind: FieldKind.Id, attribute: false, column: "deployment_id" },
  { key: "status", label: "Status", kind: FieldKind.Enum, attribute: false, column: "status" },
  {
    key: "type",
    label: "Type",
    kind: FieldKind.Enum,
    attribute: false,
    column: "type",
    aliases: TYPE_ALIASES,
  },
  {
    key: "env",
    label: "Env",
    kind: FieldKind.Enum,
    attribute: false,
    column: "environment",
    aliases: ENV_ALIASES,
  },
  { key: "version", label: "Version", kind: FieldKind.String, attribute: false, column: "version" },
  { key: "creator", label: "Creator", kind: FieldKind.String, attribute: false, column: "created_by" },
  { key: "created", label: "Created", kind: FieldKind.Date, attribute: false, column: "created_at" },
  { key: "deleted", label: "Deleted", kind: FieldKind.Date, attribute: false, column: "deleted_at" },
]

const ALIASES: Record<string, string> = {
  environment: "env",
  created_by: "creator",
  deployment_id: "id",
  created_at: "created",
  deleted_at: "deleted",
}

export const RESERVED_KEYS: ReadonlySet<string> = new Set([
  ...FIXED_FIELDS.map((field) => field.key),
  ...Object.keys(ALIASES),
  "is",
])

export const readFieldValue = (field: Field, row: Deployment): string | undefined =>
  (field.attribute ? row.attributes[field.key] : row[field.column]) ?? undefined

export function resolveKey(catalog: { byKey: ReadonlyMap<string, Field> }, raw: string): Field | undefined {
  const key = raw.toLowerCase()
  return catalog.byKey.get(ALIASES[key] ?? key)
}
