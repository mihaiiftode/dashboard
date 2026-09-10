import type { Field } from "./fields"

export enum FilterOperator {
  Equals = "equals",
  Contains = "contains",
  Glob = "glob",
}

export enum FilterKind {
  Text = "text",
  Field = "field",
  Date = "date",
  Not = "not",
}

export type DeploymentScope = "live" | "deleted"

export type QueryPlan = { scope: DeploymentScope; filters: readonly Filter[] }

export type DateBounds = { from: string; to: string | null } | { from: null; to: string }

export type Filter =
  | { kind: FilterKind.Text; value: string; operator: FilterOperator }
  | { kind: FilterKind.Field; field: Field; value: string; operator: FilterOperator }
  | ({ kind: FilterKind.Date; field: Field } & DateBounds)
  | { kind: FilterKind.Not; operand: Filter }

const withoutField = (filter: Filter, key: string): Filter | null => {
  switch (filter.kind) {
    case FilterKind.Text:
      return filter
    case FilterKind.Field:
    case FilterKind.Date:
      return filter.field.key === key ? null : filter
    case FilterKind.Not: {
      const operand = withoutField(filter.operand, key)
      return operand ? { ...filter, operand } : null
    }
  }
}

export const withoutFieldFilter = (query: QueryPlan, field: Field): QueryPlan => ({
  scope: query.scope,
  filters: query.filters.flatMap((filter) => {
    const remaining = withoutField(filter, field.key)
    return remaining ? [remaining] : []
  }),
})
