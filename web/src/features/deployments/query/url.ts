import { parseAsString } from "nuqs"

export const queryParser = parseAsString.withDefault("").withOptions({ history: "push", clearOnDefault: true })
