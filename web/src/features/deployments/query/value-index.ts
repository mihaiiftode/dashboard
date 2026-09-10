export type ValueCount = { value: string; rows: number }

export type ValueIndex = {
  values: readonly ValueCount[]
  covered: number
}

export type ValueGroup = { value: string | null | undefined; rows: number }

export const EMPTY_VALUE_INDEX: ValueIndex = { values: [], covered: 0 }

export const valueIndexOf = (groups: Iterable<ValueGroup>): ValueIndex => {
  const byValue = new Map<string, number>()
  let covered = 0
  for (const { value, rows } of groups) {
    if (value === null || value === undefined || value === "") continue
    byValue.set(value, rows)
    covered += rows
  }
  const values = [...byValue.entries()].toSorted(byRowsThenValue).map(([value, rows]) => ({ value, rows }))
  return { values, covered }
}

const byRowsThenValue = (left: readonly [string, number], right: readonly [string, number]): number =>
  right[1] - left[1] || left[0].localeCompare(right[0])

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
