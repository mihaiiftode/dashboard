import { createParser, debounce, parseAsString } from "nuqs"
import { DEFAULT_SORT, type Sorting } from "./sort"

const URL_SETTLE_MS = 350
const DESCENDING = "-"

export const queryParser = parseAsString.withDefault("").withOptions({
  history: "push",
  clearOnDefault: true,
  limitUrlUpdates: debounce(URL_SETTLE_MS),
})

export const groupParser = parseAsString.withOptions({ history: "push", clearOnDefault: true })

export const sortParser = createParser({
  parse: (raw: string): Sorting | null => {
    const desc = raw.startsWith(DESCENDING)
    const key = desc ? raw.slice(DESCENDING.length) : raw
    return key === "" ? null : { key, desc }
  },
  serialize: (sort: Sorting): string => `${sort.desc ? DESCENDING : ""}${sort.key}`,
  eq: (left: Sorting, right: Sorting): boolean => left.key === right.key && left.desc === right.desc,
})
  .withDefault(DEFAULT_SORT)
  .withOptions({ history: "push", clearOnDefault: true })
