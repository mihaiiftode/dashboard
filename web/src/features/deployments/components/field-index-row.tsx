"use client"

import type { Narrowing } from "../query/filter-set"
import type { Schema } from "../query/schema"
import type { Field } from "../query/fields"
import { useValueIndex } from "../store/use-value-index"
import { FieldRow } from "./field-row"

export type FieldIndexRowProps = {
  field: Field
  query: Narrowing
  schema: Schema
  search: string
  total: number
  visible: boolean
  grouped: boolean
  onToggleColumn: () => void
  onGroup: () => void
  onFilter: (value: string) => void
}

export const FieldIndexRow = ({ field, query, schema, ...rest }: FieldIndexRowProps) => {
  const index = useValueIndex(field, query, schema)
  return <FieldRow field={field} index={index} {...rest} />
}
