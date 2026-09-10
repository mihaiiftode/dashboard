import {
  isSafeUnquotedExpression,
  parse as parseLiqe,
  type BooleanOperatorToken,
  type ComparisonOperatorToken,
  type ParserAst,
  type TagToken,
} from "liqe"
import { parseCalendarDay, startOfCalendarDay, startOfNextDay, type CalendarDay } from "./dates"
import { resolveKey, FieldKind, type Field } from "./fields"
import { FilterKind, FilterOperator, type DateBounds, type Filter } from "./filters"
import type { Schema } from "./schema"

type NodeType = ParserAst["type"]
type ComparisonOperator = ComparisonOperatorToken["operator"]

const CONJUNCTION = "AND" satisfies BooleanOperatorToken["operator"]
const LOGICAL = "LogicalExpression" satisfies NodeType
const EMPTY = "EmptyExpression" satisfies NodeType
const NEGATION = "-"
const RESERVED = new Set(["AND", "OR", "NOT"])
const GLOB = /[*?]/u
const SCOPE_KEY = "is"

export const DELETED_SCOPE = "deleted"

const SYNTAX_ISSUE = "Incomplete or invalid query syntax"
const UNKNOWN_ISSUE = "Unknown field, missing value, or unsupported filter"

const BOUNDS_OF: Record<ComparisonOperator, (day: CalendarDay) => DateBounds> = {
  ":": (day) => ({ from: startOfCalendarDay(day), to: startOfNextDay(day) }),
  ":=": (day) => ({ from: startOfCalendarDay(day), to: startOfNextDay(day) }),
  ":<": (day) => ({ from: null, to: startOfCalendarDay(day) }),
  ":<=": (day) => ({ from: null, to: startOfNextDay(day) }),
  ":>": (day) => ({ from: startOfNextDay(day), to: null }),
  ":>=": (day) => ({ from: startOfCalendarDay(day), to: null }),
}

type Scope = "live" | "deleted"
export type Span = { start: number; end: number }

export type Clause = {
  span: Span
  prefix: string
  text: string
  issue: string | null
  key: string | null
  field: Field | null
  partial: string
  comparator: string
}

export type Narrowing = Pick<FilterSet, "filters" | "scope">

export type FilterSet = {
  source: string
  clauses: readonly Clause[]
  filters: readonly Filter[]
  scope: Scope
  syntaxIssue: string | null
}

export function parseQuery(source: string, schema: Schema): FilterSet {
  let ast: ParserAst
  try {
    ast = parseLiqe(source)
  } catch {
    return { source, clauses: [], filters: [], scope: "live", syntaxIssue: SYNTAX_ISSUE }
  }
  const readings = conjuncts(ast).map((node) => ({ node, reading: read(node, schema, false) }))
  return {
    source,
    clauses: readings.map(({ node, reading }) => clauseOf(node, source, schema, reading)),
    filters: readings.flatMap(({ reading }) => (reading.filter ? [reading.filter] : [])),
    scope: readings.some(({ reading }) => reading.scope === DELETED_SCOPE) ? "deleted" : "live",
    syntaxIssue: null,
  }
}

export const clauseAt = (query: FilterSet, caret: number): Clause | null =>
  query.clauses.find((clause) => caret >= clause.span.start && caret <= clause.span.end) ?? null

export const quoteValue = (value: string): string =>
  isSafeUnquotedExpression(value) && !RESERVED.has(value) ? value : JSON.stringify(value)

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

export const withoutClause = (query: FilterSet, span: Span): string =>
  rewrite(query.clauses.filter((clause) => clause.span.start !== span.start))

export function withValue(query: FilterSet, key: string, value: string, negate = false): string {
  const term = (negate ? NEGATION : "") + key + ":" + quoteValue(value)
  const existing = query.clauses.find((clause) => clause.field?.key === key)
  if (!existing) return query.clauses.length === 0 ? term : rewrite(query.clauses) + " " + term
  return existing.text === term ? query.source : replaceSpan(query.source, existing.span, term).query
}

const rewrite = (clauses: readonly Clause[]): string => clauses.map((clause) => clause.text).join(" ")

const conjuncts = (node: ParserAst): ParserAst[] => {
  if (node.type === EMPTY) return []
  if (node.type === LOGICAL && node.operator.operator === CONJUNCTION) {
    return [...conjuncts(node.left), ...conjuncts(node.right)]
  }
  return [node]
}

type Reading = {
  filter: Filter | null
  scope: Scope | null
  issue: string | null
  tag: TagToken | null
}

const clauseOf = (node: ParserAst, source: string, schema: Schema, reading: Reading): Clause => {
  const tag = reading.tag
  const span = node.location
  return {
    span,
    prefix: source.slice(span.start, tag?.location.start ?? span.start),
    text: source.slice(span.start, span.end),
    issue: reading.issue,
    key: tag === null ? null : keyOf(tag),
    field: tag === null ? null : fieldOf(tag, schema),
    partial: tag === null ? "" : (literalOf(tag)?.value ?? ""),
    comparator: comparatorOf(tag),
  }
}

const read = (node: ParserAst, schema: Schema, negated: boolean): Reading => {
  switch (node.type) {
    case "EmptyExpression":
      return { filter: null, scope: null, issue: null, tag: null }
    case "ParenthesizedExpression":
      return read(node.expression, schema, negated)
    case "UnaryOperator": {
      const inner = read(node.operand, schema, !negated)
      return {
        filter: inner.filter ? { kind: FilterKind.Not, operand: inner.filter } : null,
        scope: inner.scope,
        issue: inner.issue,
        tag: inner.tag,
      }
    }
    case "LogicalExpression":
      return { filter: null, scope: null, issue: UNKNOWN_ISSUE, tag: null }
    case "Tag":
      return readTag(node, schema, negated)
  }
}

const readTag = (tag: TagToken, schema: Schema, negated: boolean): Reading => {
  const literal = literalOf(tag)
  if (literal === null || literal.value.trim() === "") {
    const named = tag.field.type === "Field"
    return { filter: null, scope: null, issue: named ? UNKNOWN_ISSUE : null, tag }
  }
  const { value } = literal
  if (namesScope(tag)) {
    const scope = value.toLowerCase() === DELETED_SCOPE ? (negated ? "live" : "deleted") : null
    return { filter: null, scope, issue: scope ? null : UNKNOWN_ISSUE, tag }
  }
  const glob = !literal.quoted && GLOB.test(value)
  if (tag.field.type !== "Field") {
    const operator = glob ? FilterOperator.Glob : FilterOperator.Contains
    return { filter: { kind: FilterKind.Text, value, operator }, scope: null, issue: null, tag }
  }
  const field = resolveKey(schema, tag.field.name)
  if (!field) return { filter: null, scope: null, issue: UNKNOWN_ISSUE, tag }
  if (field.kind === FieldKind.Date) {
    const day = parseCalendarDay(value)
    if (!day) return { filter: null, scope: null, issue: UNKNOWN_ISSUE, tag }
    const bounds = BOUNDS_OF[tag.operator.operator](day)
    return { filter: { kind: FilterKind.Date, field, ...bounds }, scope: null, issue: null, tag }
  }
  return {
    filter: {
      kind: FilterKind.Field,
      field,
      operator: glob ? FilterOperator.Glob : exactness(field, tag.operator.operator),
      value: glob ? value : (field.normalize?.(value) ?? value.toLowerCase()),
    },
    scope: null,
    issue: null,
    tag,
  }
}

const exactness = (field: Field, operator: ComparisonOperator): FilterOperator =>
  field.kind === FieldKind.Enum || operator === ":=" ? FilterOperator.Equals : FilterOperator.Contains

const comparatorOf = (tag: TagToken | null): string => tag?.operator?.operator.slice(1) ?? ""

const keyOf = (tag: TagToken): string | null => (tag.field.type === "Field" ? tag.field.name.toLowerCase() : null)

const namesScope = (tag: TagToken): boolean => keyOf(tag) === SCOPE_KEY

const fieldOf = (tag: TagToken, schema: Schema): Field | null =>
  tag.field.type === "Field" && !namesScope(tag) ? (resolveKey(schema, tag.field.name) ?? null) : null

type Literal = { value: string; quoted: boolean }

const literalOf = (tag: TagToken): Literal | null =>
  tag.expression.type === "LiteralExpression" && typeof tag.expression.value === "string"
    ? { value: tag.expression.value, quoted: tag.expression.quoted }
    : null
