import { configureSync, getConsoleSink, getLogger } from "@logtape/logtape"
import { env } from "@/lib/env"

const lowestLevel = env.NODE_ENV === "production" ? "warning" : "debug"

configureSync({
  reset: true,
  sinks: { console: getConsoleSink() },
  loggers: [
    { category: ["logtape", "meta"], lowestLevel: "warning", sinks: ["console"] },
    { category: ["web"], lowestLevel, sinks: ["console"] },
  ],
})

export function createLogger(...category: string[]) {
  return getLogger(["web", ...category])
}
