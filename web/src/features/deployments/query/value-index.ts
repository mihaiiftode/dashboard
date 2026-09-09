import type { Token } from "./grammar"
import { resolveKey, type Field, type Schema } from "./schema"

export type ValueCount = { value: string; rows: number }

export type ValueIndex = {
  values: readonly ValueCount[]
  byValue: ReadonlyMap<string, number>
  covered: number
}

type ValueGroup = { value?: unknown; rows?: unknown }

export const EMPTY_VALUE_INDEX: ValueIndex = { values: [], byValue: new Map(), covered: 0 }

export const valueIndexOf = (groups: Iterable<unknown>): ValueIndex => {
  const byValue = new Map<string, number>()
  let covered = 0
  for (const group of groups) {
    const { value, rows } = group as ValueGroup
    if (typeof value !== "string" || value === "") continue
    const counted = typeof rows === "number" ? rows : 0
    byValue.set(value, counted)
    covered += counted
  }
  const values = [...byValue.entries()].sort(byRowsThenValue).map(([value, rows]) => ({ value, rows }))
  return { values, byValue, covered }
}

const byRowsThenValue = (left: readonly [string, number], right: readonly [string, number]): number =>
  right[1] - left[1] || left[0].localeCompare(right[0])

export const contextFilters = (filters: readonly Token[], field: Field, schema: Schema): Token[] =>
  filters.filter((token) => !targetsField(token, field, schema))

const targetsField = (token: Token, field: Field, schema: Schema): boolean => {
  if (token.kind === "field") return resolveKey(schema, token.key)?.key === field.key
  return token.kind === "has" && token.key === field.key
}

export const topValues = (
  index: ValueIndex,
  partial: string,
  limit: number,
  chosen: readonly string[] = [],
): ValueCount[] => {
  const wanted = partial.toLowerCase()
  const skipped = new Set(chosen)
  const matched: ValueCount[] = []
  for (const entry of index.values) {
    if (matched.length === limit) break
    if (skipped.has(entry.value)) continue
    if (wanted !== "" && !entry.value.toLowerCase().includes(wanted)) continue
    matched.push(entry)
  }
  return matched
}

export const coveredBy = (index: ValueIndex, partial: string): number => {
  const wanted = partial.toLowerCase()
  if (wanted === "") return index.covered
  let total = 0
  for (const entry of index.values) if (entry.value.toLowerCase().includes(wanted)) total += entry.rows
  return total
}
