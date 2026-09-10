import { withoutField } from "./filters"
import type { Narrowing } from "./filter-set"
import type { Field } from "./fields"

export type ValueCount = { value: string; rows: number }

export type ValueIndex = {
  values: readonly ValueCount[]
  covered: number
}

type ValueGroup = { value?: unknown; rows?: unknown }

export const EMPTY_VALUE_INDEX: ValueIndex = { values: [], covered: 0 }

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
  const values = [...byValue.entries()].toSorted(byRowsThenValue).map(([value, rows]) => ({ value, rows }))
  return { values, covered }
}

const byRowsThenValue = (left: readonly [string, number], right: readonly [string, number]): number =>
  right[1] - left[1] || left[0].localeCompare(right[0])

export const withoutFieldFilter = (query: Narrowing, field: Field): Narrowing => ({
  scope: query.scope,
  filters: query.filters.flatMap((filter) => {
    const remaining = withoutField(filter, field.key)
    return remaining ? [remaining] : []
  }),
})

export const topValues = (index: ValueIndex, partial: string, limit: number): ValueCount[] => {
  const wanted = partial.toLowerCase()
  const matched: ValueCount[] = []
  for (const entry of index.values) {
    if (matched.length === limit) break
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
