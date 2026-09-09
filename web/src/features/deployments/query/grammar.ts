export type Token =
  | { kind: "text"; raw: string; text: string }
  | { kind: "field"; raw: string; key: string; values: string[]; negated: boolean; op?: "<" | ">" }
  | { kind: "has"; raw: string; key: string; negated: boolean }
  | { kind: "is"; raw: string; value: string; negated: boolean }
  | { kind: "group"; raw: string; key: string }
  | { kind: "sort"; raw: string; key: string; desc: boolean }

export type Span = { start: number; end: number; raw: string }

export function splitTokens(query: string): Span[] {
  const spans: Span[] = []
  let i = 0
  while (i < query.length) {
    while (i < query.length && query[i] === " ") i++
    if (i >= query.length) break
    const start = i
    let inQuote = false
    while (i < query.length && (inQuote || query[i] !== " ")) {
      if (query[i] === "\\" && query[i + 1] !== undefined) {
        i += 2
        continue
      }
      if (query[i] === '"') inQuote = !inQuote
      i++
    }
    spans.push({ start, end: i, raw: query.slice(start, i) })
  }
  return spans
}

function unquote(s: string): string {
  return s.replace(/^"([\s\S]*)"$/, "$1").replace(/\\(["\\])/g, "$1")
}

export function parseToken(raw: string): Token {
  const negated = raw.startsWith("-") && raw.length > 1
  const body = negated ? raw.slice(1) : raw
  const colon = body.indexOf(":")
  if (colon > 0 && !body.startsWith('"')) {
    const key = body.slice(0, colon).toLowerCase()
    const rest = body.slice(colon + 1)
    if (key === "group") return { kind: "group", raw, key: rest.toLowerCase() }
    if (key === "sort") {
      const desc = rest.startsWith("-")
      return { kind: "sort", raw, key: (desc ? rest.slice(1) : rest).toLowerCase(), desc }
    }
    if (key === "has") return { kind: "has", raw, key: rest.toLowerCase(), negated }
    if (key === "is") return { kind: "is", raw, value: rest.toLowerCase(), negated }
    const op = rest.startsWith("<") || rest.startsWith(">") ? (rest[0] as "<" | ">") : undefined
    const valuePart = op ? rest.slice(1) : rest
    const values = valuePart.startsWith('"') ? [unquote(valuePart)] : valuePart.split(",").filter((v) => v !== "")
    return { kind: "field", raw, key, values, negated, op }
  }
  return { kind: "text", raw, text: unquote(raw) }
}

export function parse(query: string): Token[] {
  return splitTokens(query).map((s) => parseToken(s.raw))
}

export function spanAt(query: string, caret: number): Span | null {
  for (const s of splitTokens(query)) if (caret >= s.start && caret <= s.end) return s
  return null
}

export function replaceSpan(query: string, span: Span | null, replacement: string): { query: string; caret: number } {
  if (!span) {
    const base = query.endsWith(" ") || query === "" ? query : `${query} `
    const next = `${base}${replacement}`
    return { query: next, caret: next.length }
  }
  const next = `${query.slice(0, span.start)}${replacement}${query.slice(span.end)}`
  return { query: next, caret: span.start + replacement.length }
}

export function removeToken(query: string, raw: string): string {
  return splitTokens(query)
    .filter((s) => s.raw !== raw)
    .map((s) => s.raw)
    .join(" ")
}

export function upsertDirective(query: string, key: "group" | "sort", value: string | null): string {
  const kept = splitTokens(query)
    .filter((s) => !s.raw.toLowerCase().startsWith(`${key}:`))
    .map((s) => s.raw)
  if (value !== null) kept.push(`${key}:${value}`)
  return kept.join(" ")
}

export function quoteIfNeeded(v: string): string {
  return /[\s",]/.test(v) ? `"${v.replace(/"/g, '\\"')}"` : v
}

export function addValue(query: string, key: string, value: string, negate = false): string {
  const spans = splitTokens(query)
  const prefix = negate ? "-" : ""
  const wanted = `${prefix}${key}:`
  const existing = spans.find(
    (s) =>
      s.raw.toLowerCase().startsWith(wanted.toLowerCase()) &&
      !s.raw.slice(wanted.length).startsWith("<") &&
      !s.raw.slice(wanted.length).startsWith(">"),
  )
  const quoted = quoteIfNeeded(value)
  if (!existing) return [...spans.map((s) => s.raw), `${wanted}${quoted}`].join(" ")
  const current = existing.raw.slice(wanted.length)
  if (current.split(",").includes(quoted)) return query
  return spans.map((s) => (s === existing ? `${existing.raw},${quoted}` : s.raw)).join(" ")
}
