import {
  and,
  coalesce,
  concat,
  count,
  gt,
  gte,
  ilike,
  isNull,
  lt,
  not,
  or,
  type QueryBuilder,
  type RefsForContext,
} from "@tanstack/react-db"
import { subDays } from "date-fns"
import { RETENTION_DAYS } from "@/lib/format"
import type { Deployment } from "../store/schema"
import { FilterKind, FilterOperator, type Filter, type QueryPlan } from "./filters"
import { resolveKey, type Field, type FieldCatalog } from "./fields"
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

export const compileQuery = (source: DeploymentQuery, query: QueryPlan, sort: Sorting, catalog: FieldCatalog) => {
  const filtered = compileFilters(source, query, catalog)
  const field = resolveKey(catalog, sort.key)
  return field
    ? filtered.orderBy(({ deployment }) => fieldReference(deployment, field), sort.desc ? "desc" : "asc")
    : filtered
}

export const compileValueIndex = (source: DeploymentQuery, field: Field, query: QueryPlan, catalog: FieldCatalog) =>
  compileFilters(source, query, catalog)
    .groupBy(({ deployment }) => fieldReference(deployment, field))
    .select(({ deployment }) => ({
      value: fieldReference(deployment, field),
      rows: count(deployment.deployment_id),
    }))

export const compileScopeCounts = (source: DeploymentQuery) =>
  withinRetention(source)
    .groupBy(({ deployment }) => isNull(deployment.deleted_at))
    .select(({ deployment }) => ({
      live: isNull(deployment.deleted_at),
      rows: count(deployment.deployment_id),
    }))

const withinRetention = (source: DeploymentQuery): DeploymentQuery => {
  const cutoff = subDays(Date.now(), RETENTION_DAYS).toISOString()
  return source.where(({ deployment }) => or(isNull(deployment.deleted_at), gt(deployment.deleted_at, cutoff)))
}

const compileFilters = (source: DeploymentQuery, query: QueryPlan, catalog: FieldCatalog): DeploymentQuery => {
  let filtered = withinRetention(source).where(({ deployment }) => {
    const live = isNull(deployment.deleted_at)
    return query.scope === "deleted" ? not(live) : live
  })
  for (const filter of query.filters) {
    filtered = filtered.where(({ deployment }) => compileFilter(deployment, filter, catalog))
  }
  return filtered
}

const compileFilter = (row: DeploymentRefs, filter: Filter, catalog: FieldCatalog): Expression => {
  switch (filter.kind) {
    case FilterKind.Not:
      return not(compileFilter(row, filter.operand, catalog))
    case FilterKind.Text: {
      const haystack = concat(
        row.deployment_id,
        " ",
        row.version,
        " ",
        row.created_by,
        ...catalog.attributeKeys.flatMap((key) => [" ", coalesce(row.attributes[key], "")]),
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
      return ilike(target, escapeLike(value))
    case FilterOperator.Contains:
      return ilike(target, "%" + escapeLike(value) + "%")
    case FilterOperator.Glob:
      return ilike(target, globPattern(value))
  }
}

const escapeLike = (value: string): string => value.replaceAll(/[%_]/gu, "\\$&")

const globPattern = (value: string): string => escapeLike(value).replaceAll("*", "%").replaceAll("?", "_")

const fieldReference = (row: DeploymentRefs, field: Field) =>
  field.attribute ? row.attributes[field.key] : row[field.column]
