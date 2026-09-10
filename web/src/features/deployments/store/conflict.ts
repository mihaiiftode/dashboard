import type { Deployment } from "./schema"

export type FieldDifference = { key: string; attempted: string; winning: string }

const FIXED_KEYS = ["version", "status", "type", "environment"] as const

export const differencesBetween = (attempted: Deployment, winning: Deployment): FieldDifference[] => {
  const differences: FieldDifference[] = []
  for (const key of FIXED_KEYS) {
    if (attempted[key] === winning[key]) continue
    differences.push({ key, attempted: attempted[key], winning: winning[key] })
  }
  for (const key of attributeKeys(attempted, winning)) {
    if (attempted.attributes[key] === winning.attributes[key]) continue
    differences.push({
      key,
      attempted: attempted.attributes[key] ?? "",
      winning: winning.attributes[key] ?? "",
    })
  }
  return differences
}

const attributeKeys = (attempted: Deployment, winning: Deployment): string[] => [
  ...new Set([...Object.keys(attempted.attributes), ...Object.keys(winning.attributes)]),
]

export type WriteConflict = { deployment: Deployment; differences: FieldDifference[] }

export const conflictBetween = (attempted: Deployment, winning: Deployment): WriteConflict | null => {
  const differences = differencesBetween(attempted, winning)
  return differences.length === 0 ? null : { deployment: winning, differences }
}
