import type { Deployment } from "./schema"

export type FieldDifference = { key: string; attempted: string; winning: string }

const FIXED_KEYS = ["version", "status", "type", "environment"] as const

export const differencesBetween = (attempted: Deployment, winning: Deployment): FieldDifference[] => [
  ...FIXED_KEYS.filter((key) => attempted[key] !== winning[key]).map((key) => ({
    key,
    attempted: attempted[key],
    winning: winning[key],
  })),
  ...attributeKeys(attempted, winning)
    .filter((key) => attempted.attributes[key] !== winning.attributes[key])
    .map((key) => ({
      key,
      attempted: attempted.attributes[key] ?? "",
      winning: winning.attributes[key] ?? "",
    })),
]

const attributeKeys = (attempted: Deployment, winning: Deployment): string[] => [
  ...new Set([...Object.keys(attempted.attributes), ...Object.keys(winning.attributes)]),
]

export type WriteConflict = { deployment: Deployment; differences: FieldDifference[] }

export const conflictBetween = (attempted: Deployment, winning: Deployment): WriteConflict | null => {
  const differences = differencesBetween(attempted, winning)
  return differences.length === 0 ? null : { deployment: winning, differences }
}
