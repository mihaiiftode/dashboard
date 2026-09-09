"use client"

import { useCallback, useMemo, useState } from "react"
import { columnsFor, type RowActions } from "../components/table/columns"
import type { Sort } from "../components/table/deployments-table"
import { applyFilters, resolve, showsDeleted, sortRows } from "../query/apply"
import { addValue, parse, upsertDirective } from "../query/grammar"
import { buildSchema, defaultVisible, type Schema } from "../query/schema"
import { useFooterCounts } from "./use-footer-counts"
import { useDeployments } from "../store/use-deployments"

export const QUERY_INPUT_ID = "search"

const ALWAYS_VISIBLE = ["name", "description"]
const DEFAULT_SORT: Sort = { key: "created", desc: true }

export type QueryChange = (next: string | ((previous: string) => string)) => void

export const useDeploymentsView = (query: string, onQueryChange: QueryChange) => {
  const store = useDeployments()
  const { rows } = store
  const schema = useMemo(() => buildSchema(rows), [rows])
  const [chosen, setChosen] = useState<ReadonlySet<string> | null>(null)
  const [fieldsOpen, setFieldsOpen] = useState(false)

  const visible = useMemo(() => chosen ?? new Set(defaultColumns(schema)), [chosen, schema])
  const resolved = useMemo(() => resolve(parse(query), schema), [query, schema])
  const sort = resolved.sort ?? DEFAULT_SORT
  const sorted = useMemo(() => sortRows(rows, sort, schema), [rows, sort, schema])
  const matched = useMemo(() => applyFilters(sorted, resolved.filters, schema), [sorted, resolved.filters, schema])
  const deletedScope = showsDeleted(resolved.filters)
  const total = useMemo(() => countInScope(rows, deletedScope), [rows, deletedScope])
  const fields = useMemo(
    () => schema.fields.filter((field) => visible.has(field.key) || (field.key === "deleted" && deletedScope)),
    [schema, visible, deletedScope],
  )
  const hiddenAttributeKeys = useMemo(() => schema.attributeKeys.filter((key) => !visible.has(key)), [schema, visible])

  const actions = useMemo<RowActions>(
    () => ({
      onSetAttribute: store.setAttribute,
      onDelete: store.remove,
      onRestore: store.restore,
      onCopyId: store.copyId,
    }),
    [store.setAttribute, store.remove, store.restore, store.copyId],
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
    pendingIds: store.pendingIds,
    fields,
    hasAttributesColumn: hiddenAttributeKeys.length > 0,
    visible,
    invalid: resolved.invalid,
    group: resolved.group,
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
