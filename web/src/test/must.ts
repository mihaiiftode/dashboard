export const must = <T>(value: T | null | undefined, what: string): T => {
  if (value === null || value === undefined) throw new Error(`expected ${what} to be present`)
  return value
}
