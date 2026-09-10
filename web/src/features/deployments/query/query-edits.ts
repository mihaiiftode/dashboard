import { quoteValue, type Clause, type QueryDocument, type Span } from "./parse-query"

const NEGATION = "-"

export const clauseAt = (query: QueryDocument, caret: number): Clause | null =>
  query.clauses.find((clause) => caret >= clause.span.start && caret <= clause.span.end) ?? null

export function replaceSpan(source: string, span: Span | null, replacement: string): { query: string; caret: number } {
  if (!span) {
    const separator = source === "" || source.endsWith(" ") ? "" : " "
    const next = source + separator + replacement
    return { query: next, caret: next.length }
  }
  return {
    query: source.slice(0, span.start) + replacement + source.slice(span.end),
    caret: span.start + replacement.length,
  }
}

export const withoutClause = (query: QueryDocument, span: Span): string =>
  rewrite(query.clauses.filter((clause) => clause.span.start !== span.start))

export function withValue(query: QueryDocument, key: string, value: string, negate = false): string {
  const term = (negate ? NEGATION : "") + key + ":" + quoteValue(value)
  const existing = query.clauses.find((clause) => clause.field?.key === key)
  if (!existing) return query.clauses.length === 0 ? term : rewrite(query.clauses) + " " + term
  return existing.text === term ? query.source : replaceSpan(query.source, existing.span, term).query
}

const rewrite = (clauses: readonly Clause[]): string => clauses.map((clause) => clause.text).join(" ")
