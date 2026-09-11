import {
  coalesce,
  concat,
  count,
  eq,
  ilike,
  isNull,
  lower,
  not,
  type QueryBuilder,
  type RefsForContext,
} from "@tanstack/react-db"
import { RETENTION_DAYS } from "../store/schema"
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
const DAY_MS = 86_400_000

export const retentionCutoff = (now = Date.now()): number => now - RETENTION_DAYS * DAY_MS

export const compileQuery = (
  source: DeploymentQuery,
  query: QueryPlan,
  sort: Sorting,
  catalog: FieldCatalog,
  cutoff = retentionCutoff(),
) => {
  const filtered = compileFilters(source, query, catalog, cutoff)
  const field = resolveKey(catalog, sort.key)
  return field
    ? filtered.orderBy(({ deployment }) => fieldReference(deployment, field), sort.desc ? "desc" : "asc")
    : filtered
}

export const compileValueIndex = (
  source: DeploymentQuery,
  field: Field,
  query: QueryPlan,
  catalog: FieldCatalog,
  cutoff = retentionCutoff(),
) =>
  compileFilters(source, query, catalog, cutoff)
    .groupBy(({ deployment }) => fieldReference(deployment, field))
    .select(({ deployment }) => ({
      value: fieldReference(deployment, field),
      rows: count(deployment.deployment_id),
    }))

export const compileScopeCounts = (source: DeploymentQuery, cutoff = retentionCutoff()) =>
  withinRetention(source, cutoff)
    .groupBy(({ deployment }) => isNull(deployment.deleted_at))
    .select(({ deployment }) => ({
      live: isNull(deployment.deleted_at),
      rows: count(deployment.deployment_id),
    }))

const withinRetention = (source: DeploymentQuery, cutoff: number): DeploymentQuery =>
  source.fn.where(({ deployment }) => deployment.deleted_at === null || Date.parse(deployment.deleted_at) > cutoff)

const compileFilters = (
  source: DeploymentQuery,
  query: QueryPlan,
  catalog: FieldCatalog,
  cutoff: number,
): DeploymentQuery => {
  let filtered = withinRetention(source, cutoff).where(({ deployment }) => {
    const live = isNull(deployment.deleted_at)
    return query.scope === "deleted" ? not(live) : live
  })
  for (const filter of query.filters) {
    filtered = hasDateFilter(filter)
      ? filtered.fn.where(({ deployment }) => matchDateFilter(deployment, filter))
      : filtered.where(({ deployment }) => compileFilter(deployment, filter, catalog))
  }
  return filtered
}

const hasDateFilter = (filter: Filter): boolean =>
  filter.kind === FilterKind.Date || (filter.kind === FilterKind.Not && hasDateFilter(filter.operand))

const matchDateFilter = (row: Deployment, filter: Filter): boolean => {
  if (filter.kind === FilterKind.Not) return !matchDateFilter(row, filter.operand)
  if (filter.kind !== FilterKind.Date) return true
  const target = Date.parse(fieldValue(row, filter.field))
  if (filter.from === null) return target < Date.parse(filter.to)
  return filter.to === null
    ? target >= Date.parse(filter.from)
    : target >= Date.parse(filter.from) && target < Date.parse(filter.to)
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
    case FilterKind.Date:
      throw new Error("date filters require functional comparison")
  }
}

const matchString = (target: Parameters<typeof ilike>[0], value: string, operator: FilterOperator): Expression => {
  switch (operator) {
    case FilterOperator.Equals:
      return eq(lower(target), value.toLowerCase())
    case FilterOperator.Contains:
      return ilike(target, "%" + value + "%")
    case FilterOperator.Glob:
      return ilike(target, globPattern(value))
  }
}

const globPattern = (value: string): string => value.replaceAll("*", "%").replaceAll("?", "_")

const fieldReference = (row: DeploymentRefs, field: Field) =>
  field.attribute ? row.attributes[field.key] : row[field.column]

const fieldValue = (row: Deployment, field: Field): string =>
  field.attribute ? (row.attributes[field.key] ?? "") : String(row[field.column] ?? "")
