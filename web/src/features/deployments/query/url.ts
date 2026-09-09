import { debounce, parseAsString } from "nuqs"

const URL_SETTLE_MS = 350

export const queryParser = parseAsString.withDefault("").withOptions({
  history: "push",
  clearOnDefault: true,
  limitUrlUpdates: debounce(URL_SETTLE_MS),
})
