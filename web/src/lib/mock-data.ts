import { type Deployment, ENVIRONMENTS, STATUSES, TYPES } from "@/lib/types"

const TEAMS = [
  "payments",
  "checkout",
  "identity",
  "platform",
  "data-pipeline",
  "notifications",
  "search",
  "analytics",
  "onboarding",
  "billing",
  "infrastructure",
  "ml-ops",
  "content",
  "marketplace",
  "security",
]
const PREFIXES = [
  "api",
  "worker",
  "gateway",
  "proxy",
  "scheduler",
  "processor",
  "indexer",
  "aggregator",
  "dispatcher",
  "monitor",
  "collector",
  "transformer",
  "validator",
  "exporter",
  "importer",
]
const SUFFIXES = [
  "service",
  "handler",
  "engine",
  "daemon",
  "relay",
  "bridge",
  "adapter",
  "connector",
  "runner",
  "agent",
]
const DOMAINS = [
  "auth",
  "user",
  "order",
  "payment",
  "inventory",
  "catalog",
  "shipping",
  "email",
  "sms",
  "log",
  "metric",
  "event",
  "cache",
  "session",
  "config",
  "feature-flag",
  "rate-limit",
  "webhook",
]
const REGIONS = ["us-east-1", "us-west-2", "eu-west-1", "ap-southeast-1"]
const LANGUAGES = ["python", "typescript", "go", "java", "rust"]
const FRAMEWORKS = ["fastapi", "express", "gin", "spring", "actix"]
const PRIORITIES = ["critical", "high", "medium", "low"]
const FIRST = [
  "jane",
  "omar",
  "li",
  "sofia",
  "marcus",
  "aiko",
  "noah",
  "priya",
  "elena",
  "kwame",
  "lucas",
  "mei",
  "tariq",
  "hanna",
  "diego",
]
const LAST = ["doe", "haddad", "wei", "rossi", "okafor", "tanaka", "berg", "sharma", "novak", "mensah"]
const WORDS = [
  "handles",
  "routes",
  "validates",
  "aggregates",
  "streams",
  "persists",
  "schedules",
  "indexes",
  "the",
  "incoming",
  "outbound",
  "nightly",
  "customer",
  "partner",
  "internal",
  "events",
  "orders",
  "payments",
  "sessions",
  "metrics",
  "for",
  "across",
  "regions",
  "with",
  "retries",
  "and",
  "backpressure",
  "before",
  "fan-out",
]

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function buildDataset(count: number, seed = 7): Deployment[] {
  const rnd = mulberry32(seed)
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)]
  const weighted = <T>(xs: readonly T[], w: number[]) => {
    const r = rnd()
    let acc = 0
    for (let i = 0; i < xs.length; i++) {
      acc += w[i]
      if (r < acc) return xs[i]
    }
    return xs[xs.length - 1]
  }
  const uuid = () => {
    const h = () => Math.floor(rnd() * 16).toString(16)
    const s = (n: number) => Array.from({ length: n }, h).join("")
    return `${s(8)}-${s(4)}-4${s(3)}-${pick(["8", "9", "a", "b"])}${s(3)}-${s(12)}`
  }
  const creators = Array.from({ length: 30 }, () => `${pick(FIRST)}.${pick(LAST)}@example.com`)
  const now = Date.now()
  const twoYears = 2 * 365 * 24 * 3600 * 1000
  const day = 24 * 3600 * 1000
  const retentionDays = 30
  const deletedShare = 0.008
  const out: Deployment[] = []
  for (let i = 0; i < count; i++) {
    const created = now - rnd() * twoYears
    const updated = created + rnd() * (now - created)
    const domain = pick(DOMAINS)
    const name = pick([
      `${domain}-${pick(PREFIXES)}`,
      `${domain}-${pick(SUFFIXES)}`,
      `${pick(PREFIXES)}-${domain}-${pick(SUFFIXES)}`,
      `${domain}-${pick(PREFIXES)}-${pick(SUFFIXES)}`,
    ])
    const attributes: Deployment["attributes"] = { name, team: pick(TEAMS) }
    if (rnd() < 0.7)
      attributes.description = Array.from({ length: 4 + Math.floor(rnd() * 9) }, () => pick(WORDS)).join(" ") + "."
    if (rnd() < 0.5) attributes.region = pick(REGIONS)
    if (rnd() < 0.3) attributes.language = pick(LANGUAGES)
    if (rnd() < 0.2) attributes.framework = pick(FRAMEWORKS)
    if (rnd() < 0.4) attributes.priority = pick(PRIORITIES)
    if (rnd() < 0.25) attributes.oncall = pick(creators)
    out.push({
      deployment_id: uuid(),
      version: `${Math.floor(rnd() * 6)}.${Math.floor(rnd() * 21)}.${Math.floor(rnd() * 51)}`,
      status: weighted(STATUSES, [0.6, 0.15, 0.25]),
      type: weighted(TYPES, [0.5, 0.3, 0.2]),
      environment: weighted(ENVIRONMENTS, [0.4, 0.35, 0.25]),
      attributes,
      created_at: new Date(created).toISOString(),
      created_by: pick(creators),
      updated_at: new Date(updated).toISOString(),
      deleted_at: rnd() < deletedShare ? new Date(now - rnd() * (retentionDays - 1) * day).toISOString() : null,
    })
  }
  return out
}
