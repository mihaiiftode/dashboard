"use client"

import type { QueryPlan } from "../query/filters"
import type { Field, FieldCatalog } from "../query/fields"
import { useValueIndex } from "../store/use-value-index"
import { FieldRow } from "./field-row"

export type FieldIndexRowProps = {
  field: Field
  plan: QueryPlan
  catalog: FieldCatalog
  search: string
  total: number
  visible: boolean
  grouped: boolean
  onToggleColumn: () => void
  onGroup: () => void
  onFilter: (value: string) => void
}

export const FieldIndexRow = ({ field, plan, catalog, ...rest }: FieldIndexRowProps) => {
  const index = useValueIndex(field, plan, catalog)
  return <FieldRow field={field} index={index} {...rest} />
}
