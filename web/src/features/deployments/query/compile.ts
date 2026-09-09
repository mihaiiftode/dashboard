import { coalesce, concat, count, eq, ilike, inArray, isNull, not, or } from "@tanstack/react-db"
import type { Token } from "./grammar"
import type { Resolved } from "./apply"
import { RETENTION_DAYS } from "@/lib/format"
import { resolveKey, type Field, type Schema } from "./schema"

type Row = Record<string, unknown>
type Expression = ReturnType<typeof eq>
type Reference = Parameters<typeof isNull>[0]
type StringReference = Parameters<typeof ilike>[0]
type Builder = {
  where: (callback: (row: Row) => unknown) => Builder
  orderBy: (callback: (row: Row) => unknown, direction?: "asc" | "desc") => Builder
  groupBy: (callback: (row: Row) => unknown) => Builder
  select: (callback: (row: Row) => Record<string, unknown>) => Builder
  fn: { where: (callback: (row: Row) => boolean) => Builder }
}

const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000
const AGE_RULE = /^(\d+)([dhw])$/
const GLOB = "*"

export const DEFAULT_SORT = { key: "created", desc: true } as const

export const compileQuery = <T extends Builder>(source: T, state: Resolved, schema: Schema): T => {
  const filtered = compileFilters(source, state.filters, schema)
  const sort = state.sort ?? DEFAULT_SORT
  const field = resolveKey(schema, sort.key)
  if (!field) return filtered
  return filtered.orderBy((row) => readOf(row, field), sort.desc ? "desc" : "asc") as T
}

export const compileValueIndex = <T extends Builder>(
  source: T,
  field: Field,
  filters: readonly Token[],
  schema: Schema,
): T =>
  compileFilters(source, filters, schema)
    .groupBy((row) => readOf(row, field))
    .select((row) => ({ value: readOf(row, field), rows: count(reference(row, "deployment_id")) })) as T

export const compileScopeCounts = <T extends Builder>(source: T): T =>
  source
    .groupBy((row) => isNull(reference(row, "deleted_at")))
    .select((row) => ({
      live: isNull(reference(row, "deleted_at")),
      rows: count(reference(row, "deployment_id")),
    })) as T

const compileFilters = <T extends Builder>(source: T, filters: readonly Token[], schema: Schema): T => {
  const withScope = source.where((row) => scopeClause(row, filters)) as T
  const scoped = showsDeleted(filters) ? (withScope.fn.where(withinRetention) as T) : withScope
  return filters.reduce<T>((builder, token) => applyToken(builder, token, schema), scoped)
}

const showsDeleted = (filters: readonly Token[]): boolean =>
  filters.some((token) => token.kind === "is" && token.value === "deleted" && !token.negated)

const withinRetention = (row: Row): boolean => {
  const deletedAt = rowOf(row).deleted_at
  return deletedAt !== null && Date.now() - new Date(deletedAt).getTime() < RETENTION_DAYS * DAY_MS
}

const scopeClause = (row: Row, filters: readonly Token[]) => {
  const clause = isNull(reference(row, "deleted_at"))
  return showsDeleted(filters) ? not(clause) : clause
}

const applyToken = <T extends Builder>(builder: T, token: Token, schema: Schema): T => {
  if (token.kind === "is") return builder
  if (token.kind === "has") return builder.where((row) => negateIf(presence(row, token.key), token.negated)) as T
  if (token.kind === "text") return builder.where((row) => haystackClause(row, schema, token.text)) as T
  if (token.kind !== "field") return builder
  const field = resolveKey(schema, token.key)
  if (!field) return builder
  if (needsFunction(field, token)) return builder.fn.where((row) => functionMatch(row, field, token)) as T
  return builder.where((row) => negateIf(valueClause(row, field, token), token.negated)) as T
}

const needsFunction = (field: Field, token: Token): boolean =>
  token.kind === "field" && (field.kind === "date" || token.values.some((value) => value.includes(GLOB)))

const valueClause = (row: Row, field: Field, token: Token): Expression => {
  if (token.kind !== "field") throw new Error("value clause needs a field token")
  const target = readOf(row, field)
  const wanted = token.values.map((value) => (field.normalize ? field.normalize(value) : value.toLowerCase()))
  if (field.kind === "enum") {
    return wanted.length === 1 ? eq(target, wanted[0]) : inArray(target, wanted)
  }
  const clauses = wanted.map((value) => ilike(target as StringReference, `%${value}%`))
  return clauses.length === 1 ? clauses[0] : anyOf(clauses)
}

const haystackClause = (row: Row, schema: Schema, text: string): Expression =>
  ilike(haystackExpression(row, schema), `%${text.toLowerCase()}%`)

const haystackExpression = (row: Row, schema: Schema) =>
  concat(
    reference(row, "deployment_id"),
    " ",
    reference(row, "version"),
    " ",
    reference(row, "created_by"),
    ...schema.attributeKeys.flatMap((key) => [" ", coalesce(attribute(row, key), "")]),
  )

const presence = (row: Row, key: string): Expression => not(isNull(coalesce(attribute(row, key), null)))

const functionMatch = (row: Row, field: Field, token: Token): boolean => {
  if (token.kind !== "field") return true
  const value = field.read(rowOf(row))
  const hit = field.kind === "date" ? matchesAge(value, token) : value !== undefined && matchesGlob(value, token.values)
  return token.negated ? !hit : hit
}

const matchesAge = (value: string | undefined, token: Extract<Token, { kind: "field" }>): boolean => {
  if (value === undefined) return false
  const age = Date.now() - new Date(value).getTime()
  return token.values.some((raw) => {
    const span = ageOf(raw)
    return span === null ? false : token.op === ">" ? age > span : age < span
  })
}

const matchesGlob = (value: string, patterns: string[]): boolean =>
  patterns.some((pattern) => globOf(pattern).test(value))

const ageOf = (raw: string): number | null => {
  const match = AGE_RULE.exec(raw)
  if (!match) return null
  const amount = Number(match[1])
  if (match[2] === "d") return amount * DAY_MS
  return match[2] === "h" ? amount * HOUR_MS : amount * 7 * DAY_MS
}

const globOf = (pattern: string): RegExp =>
  new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`, "i")

const anyOf = (clauses: Expression[]): Expression =>
  clauses.length === 2 ? or(clauses[0], clauses[1]) : or(clauses[0], clauses[1], ...clauses.slice(2))

const negateIf = (clause: Expression, negated: boolean): Expression => (negated ? not(clause) : clause)

const rowOf = (row: Row) => row.deployment as Parameters<Field["read"]>[0]

const reference = (row: Row, key: string): Reference => (row.deployment as Row)[key] as Reference

const attribute = (row: Row, key: string): Reference => ((row.deployment as Row).attributes as Row)[key] as Reference

const readOf = (row: Row, field: Field): Reference =>
  field.attribute ? attribute(row, field.key) : reference(row, columnOf(field.key))

const COLUMN_OF: Record<string, string> = {
  id: "deployment_id",
  env: "environment",
  creator: "created_by",
  created: "created_at",
  deleted: "deleted_at",
}

const columnOf = (key: string): string => COLUMN_OF[key] ?? key
