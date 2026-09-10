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
  And = "and",
  Or = "or",
  Not = "not",
}

export type Filter =
  | { kind: FilterKind.Text; value: string; operator: FilterOperator }
  | { kind: FilterKind.Field; field: Field; value: string; operator: FilterOperator }
  | { kind: FilterKind.Date; field: Field; from: string; to: string | null }
  | { kind: FilterKind.Date; field: Field; from: null; to: string }
  | { kind: FilterKind.And | FilterKind.Or; left: Filter; right: Filter }
  | { kind: FilterKind.Not; operand: Filter }

export const withoutField = (filter: Filter, key: string): Filter | null => {
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
    case FilterKind.And:
    case FilterKind.Or: {
      const left = withoutField(filter.left, key)
      const right = withoutField(filter.right, key)
      return left && right ? { ...filter, left, right } : (left ?? right)
    }
  }
}
