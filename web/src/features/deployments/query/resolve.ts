import { type Token } from "./grammar"
import { resolveKey, type Schema } from "./schema"

export type Resolved = {
  filters: Token[]
  group: string | null
  sort: { key: string; desc: boolean } | null
  invalid: Token[]
}

export const DELETED_SCOPE = "deleted"

export function resolve(tokens: Token[], schema: Schema): Resolved {
  const out: Resolved = { filters: [], group: null, sort: null, invalid: [] }
  for (const t of tokens) {
    if (t.kind === "group") {
      const field = resolveKey(schema, t.key)
      if (field) out.group = field.key
      else out.invalid.push(t)
    } else if (t.kind === "sort") {
      const field = resolveKey(schema, t.key)
      if (field) out.sort = { key: field.key, desc: t.desc }
      else out.invalid.push(t)
    } else if (t.kind === "has") {
      if (schema.attributeCounts.has(t.key)) out.filters.push(t)
      else out.invalid.push(t)
    } else if (t.kind === "field") {
      if (resolveKey(schema, t.key) && t.values.length > 0) out.filters.push(t)
      else out.invalid.push(t)
    } else if (t.kind === "is") {
      if (t.value === DELETED_SCOPE) out.filters.push(t)
      else out.invalid.push(t)
    } else if (t.text.trim() !== "") {
      out.filters.push(t)
    }
  }
  return out
}

export function showsDeleted(filters: readonly Token[]): boolean {
  return filters.some((t) => t.kind === "is" && t.value === DELETED_SCOPE && !t.negated)
}
