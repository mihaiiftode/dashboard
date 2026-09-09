import type { Deployment } from "../store/schema"
import { applyFilters, DELETED_SCOPE, resolve } from "./apply"
import { parse, parseToken, quoteIfNeeded, spanAt, type Span } from "./grammar"
import { resolveKey, type Schema } from "./schema"

export type Suggestion = {
  id: string
  kind: "key" | "value" | "contains" | "directive" | "hint"
  label: string
  detail?: string
  count?: number
  insert: string
}

const DIRECTIVE_DETAIL: Record<string, string> = {
  group: "group rows by a column",
  sort: "order rows, prefix - for desc",
  has: "rows that carry an attribute",
  is: "is:deleted shows the trash",
}
const DIRECTIVE_KEYS = Object.keys(DIRECTIVE_DETAIL)
const AGE_VALUES = ["<24h", "<7d", "<30d", ">30d", ">90d"]

export function suggest(
  query: string,
  caret: number,
  rows: Deployment[],
  schema: Schema,
): { span: Span | null; items: Suggestion[] } {
  const span = spanAt(query, caret)
  const raw = span?.raw ?? ""
  const negated = raw.startsWith("-")
  const body = negated ? raw.slice(1) : raw
  const colon = body.indexOf(":")
  const prefix = negated ? "-" : ""

  if (colon === -1) {
    const q = body.toLowerCase()
    const keys = [...schema.fields.map((f) => f.key), ...DIRECTIVE_KEYS].filter((k) => k.startsWith(q))
    const items: Suggestion[] = keys.map((k) => {
      const field = schema.byKey.get(k)
      const count = field?.attribute ? schema.attributeCounts.get(k) : undefined
      const detail = DIRECTIVE_DETAIL[k] ?? (field?.attribute ? "attribute" : field?.kind)
      return {
        id: `key:${k}`,
        kind: DIRECTIVE_KEYS.includes(k) ? "directive" : "key",
        label: `${prefix}${k}:`,
        detail,
        count,
        insert: `${prefix}${k}:`,
      }
    })
    if (q !== "")
      items.push({ id: "hint:text", kind: "hint", label: `“${body}”`, detail: "match anywhere", insert: raw })
    return { span, items }
  }

  const key = body.slice(0, colon).toLowerCase()
  const rest = body.slice(colon + 1)
  const parts = rest.split(",")
  const partial = parts[parts.length - 1].replace(/^[<>]/, "").toLowerCase()
  const chosen = parts.slice(0, -1)
  const withChosen = (v: string) => `${prefix}${key}:${[...chosen, v].join(",")} `

  if (key === "group" || key === "sort") {
    const desc = key === "sort" && rest.startsWith("-")
    const items = schema.fields
      .filter((f) => f.key.startsWith(desc ? partial.slice(1) : partial))
      .map((f) => ({
        id: `${key}:${f.key}`,
        kind: "directive" as const,
        label: `${key}:${desc ? "-" : ""}${f.key}`,
        detail: f.attribute ? "attribute" : f.label,
        insert: `${key}:${desc ? "-" : ""}${f.key} `,
      }))
    return { span, items }
  }
  if (key === "is") {
    if (!DELETED_SCOPE.startsWith(partial)) return { span, items: [] }
    const deleted = rows.reduce((n, d) => n + (d.deleted_at !== null ? 1 : 0), 0)
    return {
      span,
      items: [
        {
          id: "is:deleted",
          kind: "value",
          label: `${prefix}is:${DELETED_SCOPE}`,
          detail: "recoverable for 30 days",
          count: deleted,
          insert: `${prefix}is:${DELETED_SCOPE} `,
        },
      ],
    }
  }
  if (key === "has") {
    const items = schema.attributeKeys
      .filter((k) => k.startsWith(partial))
      .map((k) => ({
        id: `has:${k}`,
        kind: "value" as const,
        label: `${prefix}has:${k}`,
        count: schema.attributeCounts.get(k),
        insert: `${prefix}has:${k} `,
      }))
    return { span, items }
  }

  const field = resolveKey(schema, key)
  if (!field) return { span, items: [] }

  if (field.kind === "date") {
    const items = AGE_VALUES.filter((v) => v.replace(/^[<>]/, "").startsWith(partial)).map((v) => ({
      id: `${key}:${v}`,
      kind: "value" as const,
      label: `${prefix}${key}:${v}`,
      detail: v.startsWith("<") ? "newer than" : "older than",
      insert: `${prefix}${key}:${v} `,
    }))
    return { span, items }
  }

  const tokens = parse(query)
  const current = span ? parseToken(span.raw) : undefined
  const { filters } = resolve(tokens, schema)
  const context = applyFilters(
    rows,
    filters,
    schema,
    filters.find((f) => f.raw === current?.raw),
  )
  const counts = new Map<string, number>()
  for (const d of context) {
    const v = field.read(d)
    if (v !== undefined) counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  const matching = [...counts.entries()].filter(([v]) => v.toLowerCase().includes(partial) && !chosen.includes(v))
  const values: Suggestion[] = matching
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([v, count]) => ({
      id: `${key}:${v}`,
      kind: "value",
      label: `${prefix}${key}:${quoteIfNeeded(v)}`,
      count,
      insert: withChosen(quoteIfNeeded(v)),
    }))
  if (field.kind === "enum") return { span, items: values }
  const typed = parts[parts.length - 1]
  const contains: Suggestion = {
    id: "contains",
    kind: "contains",
    label: `${prefix}${key}:${typed === "" ? "…" : quoteIfNeeded(typed)}`,
    detail: "matches anywhere",
    count: matching.reduce((n, [, c]) => n + c, 0),
    insert: typed === "" ? `${prefix}${key}:` : withChosen(quoteIfNeeded(typed)),
  }
  return { span, items: [contains, ...values] }
}
