import type { Deployment } from "../store/schema"
import { type Token } from "./grammar"
import { resolveKey, type Schema } from "./schema"

export type Resolved = {
  filters: Token[]
  group: string | null
  sort: { key: string; desc: boolean } | null
  invalid: Token[]
}

const DAY = 86400e3
export const DELETED_SCOPE = "deleted"

const HAYSTACK = new WeakMap<Deployment, string>()

export function haystack(d: Deployment): string {
  let h = HAYSTACK.get(d)
  if (h === undefined) {
    h = [d.deployment_id, d.version, d.created_by, ...Object.values(d.attributes)].join(" ").toLowerCase()
    HAYSTACK.set(d, h)
  }
  return h
}

export function sortRows(
  rows: Deployment[],
  sort: { key: string; desc: boolean } | null,
  schema: Schema,
): Deployment[] {
  if (!sort) return rows
  const field = resolveKey(schema, sort.key)
  if (!field) return rows
  const dir = sort.desc ? -1 : 1
  const keyed = rows.map((d) => ({ d, v: field.read(d) }))
  keyed.sort((a, b) => {
    if (a.v === undefined && b.v === undefined) return 0
    if (a.v === undefined) return 1
    if (b.v === undefined) return -1
    return a.v < b.v ? -dir : a.v > b.v ? dir : 0
  })
  return keyed.map((k) => k.d)
}

function glob(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")
  return new RegExp(`^${escaped}$`, "i")
}

function parseAge(v: string): number | null {
  const m = /^(\d+)([dhw])$/.exec(v)
  if (!m) return null
  const n = Number(m[1])
  return m[2] === "d" ? n * DAY : m[2] === "h" ? n * 3600e3 : n * 7 * DAY
}

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

export function matches(d: Deployment, token: Token, schema: Schema, now = Date.now()): boolean {
  if (token.kind === "text") return haystack(d).includes(token.text.toLowerCase())
  if (token.kind === "has") {
    const present = d.attributes[token.key] !== undefined
    return token.negated ? !present : present
  }
  if (token.kind !== "field") return true
  const field = resolveKey(schema, token.key)
  if (!field) return false
  const value = field.read(d)
  let hit: boolean
  if (field.kind === "date") {
    const age = value ? now - new Date(value).getTime() : undefined
    hit =
      age !== undefined &&
      token.values.some((v) => {
        const span = parseAge(v)
        if (span === null) return false
        return token.op === ">" ? age > span : age < span
      })
  } else {
    hit =
      value !== undefined &&
      token.values.some((v) => {
        if (v.includes("*")) return glob(v).test(value)
        const wanted = field.normalize ? field.normalize(v) : v.toLowerCase()
        return field.kind === "enum" ? value.toLowerCase() === wanted : value.toLowerCase().includes(wanted)
      })
  }
  return token.negated ? !hit : hit
}

export function showsDeleted(filters: Token[]): boolean {
  return filters.some((t) => t.kind === "is" && t.value === DELETED_SCOPE && !t.negated)
}

export function applyFilters(rows: Deployment[], filters: Token[], schema: Schema, skip?: Token): Deployment[] {
  const active = skip ? filters.filter((f) => f !== skip) : filters
  const deleted = showsDeleted(active)
  const now = Date.now()
  return rows.filter((d) => (d.deleted_at !== null) === deleted && active.every((t) => matches(d, t, schema, now)))
}
