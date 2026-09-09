"use client"

import type { Token } from "../query/grammar"
import type { Field, Schema } from "../query/schema"
import { useValueIndex } from "../store/use-value-index"
import { FieldRow } from "./field-row"

export type FieldIndexRowProps = {
  field: Field
  filters: readonly Token[]
  schema: Schema
  search: string
  total: number
  visible: boolean
  grouped: boolean
  onToggleColumn: () => void
  onGroup: () => void
  onFilter: (value: string) => void
}

export const FieldIndexRow = ({ field, filters, schema, ...rest }: FieldIndexRowProps) => {
  const index = useValueIndex(field, filters, schema)
  return <FieldRow field={field} index={index} {...rest} />
}
