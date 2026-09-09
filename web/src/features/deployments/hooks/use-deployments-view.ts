"use client"

import { useCallback, useDeferredValue, useMemo, useState } from "react"
import { columnsFor, type RowActions } from "../components/table/columns"
import type { Sort } from "../components/table/deployments-table"
import { DEFAULT_SORT } from "../query/compile"
import { resolve, showsDeleted } from "../query/resolve"
import { addValue, parse, upsertDirective } from "../query/grammar"
import { buildSchema, defaultVisible, groupCandidates, type Schema } from "../query/schema"
import { indexFieldAt, suggest } from "../query/suggest"
import { contextFilters } from "../query/value-index"
import { useFooterCounts } from "./use-footer-counts"
import { useSettledValue } from "./use-settled-value"
import { useAllDeployments, useDeploymentWrites, useMatchedDeployments } from "../store/use-deployments"
import { useSyncStatus } from "../store/use-sync-status"
import { useScopeCounts, useValueIndex } from "../store/use-value-index"

export const QUERY_INPUT_ID = "search"

const ALWAYS_VISIBLE = ["name", "description"]
const DATA_SETTLE_MS = 120

export type QueryChange = (next: string | ((previous: string) => string)) => void

export const useDeploymentsView = (query: string, onQueryChange: QueryChange) => {
  const rows = useAllDeployments()
  const sync = useSyncStatus()
  const writes = useDeploymentWrites()
  const schema = useMemo(() => buildSchema(rows), [rows])
  const [chosen, setChosen] = useState<ReadonlySet<string> | null>(null)
  const [fieldsOpen, setFieldsOpen] = useState(false)
  const [caret, setCaret] = useState(query.length)
  const [fieldSearch, setFieldSearch] = useState("")

  const visible = useMemo(() => chosen ?? new Set(defaultColumns(schema)), [chosen, schema])
  const resolved = useMemo(() => resolve(parse(query), schema), [query, schema])
  const settledQuery = useDeferredValue(query)
  const settledCaret = useDeferredValue(caret)
  const dataQuery = useSettledValue(query, DATA_SETTLE_MS)
  const settled = useMemo(() => resolve(parse(dataQuery), schema), [dataQuery, schema])
  const sort = settled.sort ?? DEFAULT_SORT
  const matched = useMatchedDeployments(settled, schema)
  const deletedScope = showsDeleted(settled.filters)

  const listedFields = useMemo(() => groupCandidates(schema), [schema])
  const suggesting = useMemo(
    () => indexFieldAt(settledQuery, settledCaret, schema),
    [settledQuery, settledCaret, schema],
  )
  const suggestFilters = useMemo(
    () => (suggesting ? contextFilters(settled.filters, suggesting, schema) : []),
    [settled, suggesting, schema],
  )
  const index = useValueIndex(suggesting, suggestFilters, schema)
  const scope = useScopeCounts()
  const suggestions = useMemo(
    () => suggest(settledQuery, settledCaret, schema, { index, deletedRows: scope.deleted }),
    [settledQuery, settledCaret, schema, index, scope.deleted],
  )

  const total = deletedScope ? scope.deleted : scope.live
  const group = settled.group
  const fields = useMemo(
    () =>
      schema.fields.filter(
        (field) => visible.has(field.key) || field.key === group || (field.key === "deleted" && deletedScope),
      ),
    [schema, visible, group, deletedScope],
  )
  const hiddenAttributeKeys = useMemo(
    () => schema.attributeKeys.filter((key) => !visible.has(key) && key !== group),
    [schema, visible, group],
  )

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
  const onFieldSearchChange = useCallback((next: string) => setFieldSearch(next), [])
  const onToggleFields = useCallback(() => setFieldsOpen((open) => !open), [])
  const columns = useMemo(
    () => columnsFor(schema, fields, hiddenAttributeKeys, actions),
    [schema, fields, hiddenAttributeKeys, actions],
  )
  const onRangeChange = useFooterCounts(matched.length, total, sync.connection)

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
    group,
    sort,
    actions,
    fieldsOpen,
    suggestions,
    queryFilters: settled.filters,
    listedFields,
    fieldSearch,
    fieldSearchTerm: fieldSearch.trim().toLowerCase(),
    onCaretChange: setCaret,
    onFieldSearchChange,
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
