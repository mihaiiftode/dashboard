import { isSafeUnquotedExpression, parse as parseLiqe, type ParserAst, type TagToken } from "liqe"
import { parseCalendarDay, startOfCalendarDay, startOfNextDay, type CalendarDay } from "./dates"
import { resolveKey, FieldKind, type Field, type FieldCatalog } from "./fields"
import {
  FilterKind,
  FilterOperator,
  type DateBounds,
  type Filter,
  type QueryPlan,
  type DeploymentScope,
} from "./filters"

type ComparisonOperator = TagToken["operator"]["operator"]
type Literal = { value: string; quoted: boolean }
type Outcome = { filter: Filter } | { scope: DeploymentScope } | { issue: string } | null

const RESERVED = new Set(["AND", "OR", "NOT"])
const INVALID = { issue: "Unknown field, missing value, or unsupported filter" }
const SYNTAX_ISSUE = "Incomplete or invalid query syntax"
const SCOPE_KEY = "is"
const GLOB = /[*?]/u
const RELATIONAL = new Set<ComparisonOperator>([":<", ":<=", ":>", ":>="])

export const DELETED_SCOPE = "deleted"
const LIVE_SCOPE = "live"

const DATE_BOUNDS: Record<ComparisonOperator, (day: CalendarDay) => DateBounds> = {
  ":": (day) => ({ from: startOfCalendarDay(day), to: startOfNextDay(day) }),
  ":=": (day) => ({ from: startOfCalendarDay(day), to: startOfNextDay(day) }),
  ":<": (day) => ({ from: null, to: startOfCalendarDay(day) }),
  ":<=": (day) => ({ from: null, to: startOfNextDay(day) }),
  ":>": (day) => ({ from: startOfNextDay(day), to: null }),
  ":>=": (day) => ({ from: startOfCalendarDay(day), to: null }),
}

export type Span = { start: number; end: number }

export type Clause = {
  span: Span
  edit: Span
  editText: string
  text: string
  key: string | null
  field: Field | null
  partial: string
  comparator: string
}

type QueryDiagnostic = { span: Span | null; message: string }

export type QueryDocument = {
  source: string
  clauses: readonly Clause[]
  plan: QueryPlan
  diagnostics: readonly QueryDiagnostic[]
}

export function parseQuery(source: string, catalog: FieldCatalog): QueryDocument {
  let ast: ParserAst
  try {
    ast = parseLiqe(source)
  } catch {
    return {
      source,
      clauses: [],
      plan: { filters: [], scope: LIVE_SCOPE },
      diagnostics: [{ span: null, message: SYNTAX_ISSUE }],
    }
  }
  const clauses: Clause[] = []
  const filters: Filter[] = []
  const diagnostics: QueryDiagnostic[] = []
  let scope: DeploymentScope = LIVE_SCOPE

  for (const node of splitClauses(ast)) {
    const { clause, outcome } = parseClause(node, source, catalog)
    clauses.push(clause)
    if (outcome === null) continue
    if ("filter" in outcome) filters.push(outcome.filter)
    else if ("scope" in outcome) {
      if (outcome.scope === DELETED_SCOPE) scope = DELETED_SCOPE
    } else diagnostics.push({ span: clause.span, message: outcome.issue })
  }
  return { source, clauses, plan: { filters, scope }, diagnostics }
}

export const quoteValue = (value: string): string =>
  isSafeUnquotedExpression(value) && !RESERVED.has(value) ? value : JSON.stringify(value)

const splitClauses = (node: ParserAst): ParserAst[] => {
  if (node.type === "EmptyExpression") return []
  if (node.type === "LogicalExpression" && node.operator.operator === "AND") {
    return [...splitClauses(node.left), ...splitClauses(node.right)]
  }
  return [node]
}

const unwrapClause = (node: ParserAst) => {
  let expression = node
  let negations = 0
  while (expression.type === "ParenthesizedExpression" || expression.type === "UnaryOperator") {
    if (expression.type === "UnaryOperator") {
      negations++
      expression = expression.operand
    } else expression = expression.expression
  }
  return { expression, negations }
}

const parseClause = (node: ParserAst, source: string, catalog: FieldCatalog): { clause: Clause; outcome: Outcome } => {
  const { expression, negations } = unwrapClause(node)
  const tag = expression.type === "Tag" ? expression : null
  const comparison = tag?.operator?.operator ?? ":"
  const key = tag?.field.type === "Field" ? tag.field.name.toLowerCase() : null
  const literal = tag ? literalOf(tag) : null
  const edit = tag?.location ?? node.location
  const clause: Clause = {
    span: node.location,
    edit,
    editText: source.slice(edit.start, edit.end),
    text: source.slice(node.location.start, node.location.end),
    key,
    field: key === null || key === SCOPE_KEY ? null : (resolveKey(catalog, key) ?? null),
    partial: literal?.value ?? "",
    comparator: comparison.slice(1),
  }
  let outcome: Outcome = INVALID
  if (tag) outcome = resolveClause(clause, literal, comparison)
  else if (expression.type === "EmptyExpression") outcome = null

  for (let i = 0; i < negations; i++) {
    if (outcome && "filter" in outcome) outcome = { filter: { kind: FilterKind.Not, operand: outcome.filter } }
    else if (outcome && "scope" in outcome)
      outcome = { scope: outcome.scope === DELETED_SCOPE ? LIVE_SCOPE : DELETED_SCOPE }
  }
  return { clause, outcome }
}

const resolveClause = (clause: Clause, literal: Literal | null, comparison: ComparisonOperator): Outcome => {
  if (!literal || literal.value.trim() === "") return clause.key === null ? null : INVALID
  const { value, quoted } = literal
  if (clause.key === SCOPE_KEY) return value.toLowerCase() === DELETED_SCOPE ? { scope: DELETED_SCOPE } : INVALID

  let operator = !quoted && GLOB.test(value) ? FilterOperator.Glob : FilterOperator.Contains
  if (clause.key === null) return { filter: { kind: FilterKind.Text, value, operator } }
  const field = clause.field
  if (!field) return INVALID
  if (field.kind === FieldKind.Date) {
    const day = parseCalendarDay(value)
    return day ? { filter: { kind: FilterKind.Date, field, ...DATE_BOUNDS[comparison](day) } } : INVALID
  }
  if (RELATIONAL.has(comparison)) return INVALID
  if (operator !== FilterOperator.Glob && (field.kind === FieldKind.Enum || comparison === ":=")) {
    operator = FilterOperator.Equals
  }
  return {
    filter: {
      kind: FilterKind.Field,
      field,
      operator,
      value: operator === FilterOperator.Glob ? value : (field.normalize?.(value) ?? value.toLowerCase()),
    },
  }
}

const literalOf = (tag: TagToken): Literal | null =>
  tag.expression.type === "LiteralExpression" && typeof tag.expression.value === "string"
    ? { value: tag.expression.value, quoted: tag.expression.quoted }
    : null
