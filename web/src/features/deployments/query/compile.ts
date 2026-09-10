import {
  and,
  coalesce,
  concat,
  count,
  eq,
  gt,
  gte,
  ilike,
  isNull,
  lt,
  not,
  type QueryBuilder,
  type RefsForContext,
} from "@tanstack/react-db"
import { subDays } from "date-fns"
import { RETENTION_DAYS } from "@/lib/format"
import type { Deployment } from "../store/schema"
import { FilterKind, FilterOperator, type Filter } from "./filters"
import type { Narrowing } from "./filter-set"
import { type Schema } from "./schema"
import { resolveKey, type Field } from "./fields"
import type { Sorting } from "./sort"

type DeploymentContext = {
  baseSchema: { deployment: Deployment }
  schema: { deployment: Deployment }
  fromSourceName: "deployment"
  hasJoins: false
}
type DeploymentQuery = QueryBuilder<DeploymentContext>
type DeploymentRefs = RefsForContext<DeploymentContext>["deployment"]
type Expression = ReturnType<typeof isNull>

export const compileQuery = (source: DeploymentQuery, query: Narrowing, sort: Sorting, schema: Schema) => {
  const filtered = compileFilters(source, query, schema)
  const field = resolveKey(schema, sort.key)
  return field
    ? filtered.orderBy(({ deployment }) => fieldReference(deployment, field), sort.desc ? "desc" : "asc")
    : filtered
}

export const compileValueIndex = (source: DeploymentQuery, field: Field, query: Narrowing, schema: Schema) =>
  compileFilters(source, query, schema)
    .groupBy(({ deployment }) => fieldReference(deployment, field))
    .select(({ deployment }) => ({
      value: fieldReference(deployment, field),
      rows: count(deployment.deployment_id),
    }))

export const compileScopeCounts = (source: DeploymentQuery) =>
  source
    .groupBy(({ deployment }) => isNull(deployment.deleted_at))
    .select(({ deployment }) => ({
      live: isNull(deployment.deleted_at),
      rows: count(deployment.deployment_id),
    }))

const compileFilters = (source: DeploymentQuery, query: Narrowing, schema: Schema): DeploymentQuery => {
  let filtered = source.where(({ deployment }) => {
    const live = isNull(deployment.deleted_at)
    return query.scope === "deleted" ? not(live) : live
  })
  if (query.scope === "deleted") {
    const cutoff = subDays(Date.now(), RETENTION_DAYS).toISOString()
    filtered = filtered.where(({ deployment }) => gt(deployment.deleted_at, cutoff))
  }
  for (const filter of query.filters) {
    filtered = filtered.where(({ deployment }) => compileFilter(deployment, filter, schema))
  }
  return filtered
}

const compileFilter = (row: DeploymentRefs, filter: Filter, schema: Schema): Expression => {
  switch (filter.kind) {
    case FilterKind.Not:
      return not(compileFilter(row, filter.operand, schema))
    case FilterKind.Text: {
      const haystack = concat(
        row.deployment_id,
        " ",
        row.version,
        " ",
        row.created_by,
        ...schema.attributeKeys.flatMap((key) => [" ", coalesce(row.attributes[key], "")]),
      )
      return matchString(haystack, filter.value, filter.operator)
    }
    case FilterKind.Field:
      return matchString(fieldReference(row, filter.field), filter.value, filter.operator)
    case FilterKind.Date: {
      const target = fieldReference(row, filter.field)
      if (filter.from === null) return lt(target, filter.to)
      return filter.to === null ? gte(target, filter.from) : and(gte(target, filter.from), lt(target, filter.to))
    }
  }
}

const matchString = (target: Parameters<typeof ilike>[0], value: string, operator: FilterOperator): Expression => {
  switch (operator) {
    case FilterOperator.Equals:
      return eq(target, value)
    case FilterOperator.Contains:
      return ilike(target, "%" + value.replaceAll(/[%_]/gu, "\\$&") + "%")
    case FilterOperator.Glob:
      return ilike(target, globPattern(value))
  }
}

const globPattern = (value: string): string =>
  value.replaceAll(/[%_]/gu, "\\$&").replaceAll("*", "%").replaceAll("?", "_")

const fieldReference = (row: DeploymentRefs, field: Field) =>
  field.attribute ? row.attributes[field.key] : row[field.column]
