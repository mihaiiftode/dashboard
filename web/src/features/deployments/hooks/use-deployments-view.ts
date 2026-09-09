"use client"

import { useCallback, useDeferredValue, useMemo, useState } from "react"
import { columnsFor, type RowActions } from "../components/table/columns"
import type { Sort } from "../components/table/deployments-table"
import { resolve, showsDeleted } from "../query/apply"
import { addValue, parse, upsertDirective } from "../query/grammar"
import { buildSchema, defaultVisible, type Schema } from "../query/schema"
import { useFooterCounts } from "./use-footer-counts"
import { useAllDeployments, useDeploymentWrites, useMatchedDeployments } from "../store/use-deployments"

export const QUERY_INPUT_ID = "search"

const ALWAYS_VISIBLE = ["name", "description"]
const DEFAULT_SORT: Sort = { key: "created", desc: true }

export type QueryChange = (next: string | ((previous: string) => string)) => void

export const useDeploymentsView = (query: string, onQueryChange: QueryChange) => {
  const rows = useAllDeployments()
  const writes = useDeploymentWrites()
  const schema = useMemo(() => buildSchema(rows), [rows])
  const [chosen, setChosen] = useState<ReadonlySet<string> | null>(null)
  const [fieldsOpen, setFieldsOpen] = useState(false)

  const visible = useMemo(() => chosen ?? new Set(defaultColumns(schema)), [chosen, schema])
  const resolved = useMemo(() => resolve(parse(query), schema), [query, schema])
  const settledQuery = useDeferredValue(query)
  const settled = useMemo(() => resolve(parse(settledQuery), schema), [settledQuery, schema])
  const sort = settled.sort ?? DEFAULT_SORT
  const matched = useMatchedDeployments(settled, schema)
  const deletedScope = showsDeleted(settled.filters)
  const total = useMemo(() => countInScope(rows, deletedScope), [rows, deletedScope])
  const fields = useMemo(
    () => schema.fields.filter((field) => visible.has(field.key) || (field.key === "deleted" && deletedScope)),
    [schema, visible, deletedScope],
  )
  const hiddenAttributeKeys = useMemo(() => schema.attributeKeys.filter((key) => !visible.has(key)), [schema, visible])

  const actions = useMemo<RowActions>(
    () => ({
      onSetAttribute: writes.setAttribute,
      onDelete: writes.remove,
      onRestore: writes.restore,
      onCopyId: writes.copyId,
    }),
    [writes],
  )

  const onSortChange = useCallback(
    (next: Sort) =>
      onQueryChange((previous) =>
        upsertDirective(previous, "sort", next ? `${next.desc ? "-" : ""}${next.key}` : null),
      ),
    [onQueryChange],
  )
  const onGroupChange = useCallback(
    (key: string | null) => onQueryChange((previous) => upsertDirective(previous, "group", key)),
    [onQueryChange],
  )
  const onFilter = useCallback(
    (key: string, value: string) => onQueryChange((previous) => addValue(previous, key, value)),
    [onQueryChange],
  )
  const onClearQuery = useCallback(() => onQueryChange(""), [onQueryChange])
  const onToggleColumn = useCallback(
    (key: string) =>
      setChosen((previous) => {
        const next = new Set(previous ?? visible)
        if (next.has(key)) next.delete(key)
        else next.add(key)
        return next
      }),
    [visible],
  )
  const onResetColumns = useCallback(() => setChosen(null), [])
  const onToggleFields = useCallback(() => setFieldsOpen((open) => !open), [])
  const columns = useMemo(
    () => columnsFor(schema, fields, hiddenAttributeKeys, actions),
    [schema, fields, hiddenAttributeKeys, actions],
  )
  const onRangeChange = useFooterCounts(matched.length, total)

  return {
    rows,
    matched,
    schema,
    columns,
    pendingIds: writes.pendingIds,
    fields,
    hasAttributesColumn: hiddenAttributeKeys.length > 0,
    visible,
    invalid: resolved.invalid,
    group: settled.group,
    sort,
    actions,
    fieldsOpen,
    onSortChange,
    onGroupChange,
    onFilter,
    onClearQuery,
    onToggleColumn,
    onResetColumns,
    onToggleFields,
    onRangeChange,
  }
}

const defaultColumns = (schema: Schema) => [...ALWAYS_VISIBLE, ...defaultVisible(schema)]

const countInScope = (rows: readonly { deleted_at: string | null }[], deletedScope: boolean) =>
  rows.reduce((count, row) => count + ((row.deleted_at !== null) === deletedScope ? 1 : 0), 0)
