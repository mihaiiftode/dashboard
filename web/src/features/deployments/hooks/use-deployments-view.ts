"use client"

import { useCallback, useDeferredValue, useMemo, useState } from "react"
import { columnsFor, type RowActions } from "../components/table/columns"
import { clauseAt, parseQuery, withValue } from "../query/filter-set"
import { buildSchema, type Schema } from "../query/schema"
import { defaultVisible, groupCandidates } from "../components/table/field-presentation"
import { indexedFieldOf, suggest } from "../query/suggest"
import { withoutFieldFilter } from "../query/value-index"
import { useFooterCounts } from "./use-footer-counts"
import { useSettledValue } from "./use-settled-value"
import { useAllDeployments, useDeploymentWrites, useMatchedDeployments } from "../store/use-deployments"
import { useSyncStatus } from "../store/use-sync-status"
import { useScopeCounts, useValueIndex } from "../store/use-value-index"
import { sortParser } from "../query/url"
import type { QueryDirective } from "../components/query-chips"
import { DEFAULT_SORT, type Sorting } from "../query/sort"
import type { Sort } from "../components/table/deployments-table"

export const QUERY_INPUT_ID = "search"

const ALWAYS_VISIBLE = ["name", "description"]
const DATA_SETTLE_MS = 120

export type QueryChange = (next: string | ((previous: string) => string)) => void

export type ViewInput = {
  query: string
  onQueryChange: QueryChange
  group: string | null
  onGroupChange: (next: string | null) => void
  sort: Sorting
  onSortChange: (next: Sorting) => void
}

export const useDeploymentsView = ({ query, onQueryChange, group, onGroupChange, sort, onSortChange }: ViewInput) => {
  const rows = useAllDeployments()
  const sync = useSyncStatus()
  const writes = useDeploymentWrites()
  const schema = useMemo(() => buildSchema(rows), [rows])
  const [chosen, setChosen] = useState<ReadonlySet<string> | null>(null)
  const [fieldsOpen, setFieldsOpen] = useState(false)
  const [caret, setCaret] = useState(query.length)
  const [fieldSearch, setFieldSearch] = useState("")

  const visible = useMemo(() => chosen ?? new Set(defaultColumns(schema)), [chosen, schema])
  const parsed = useMemo(() => parseQuery(query, schema), [query, schema])
  const settledCaret = useDeferredValue(caret)
  const dataQuery = useSettledValue(query, DATA_SETTLE_MS)
  const settled = useMemo(() => parseQuery(dataQuery, schema), [dataQuery, schema])
  const matched = useMatchedDeployments(settled, sort, schema)
  const deletedScope = settled.scope === "deleted"

  const listedFields = useMemo(() => groupCandidates(schema), [schema])
  const caretClause = useMemo(() => clauseAt(parsed, settledCaret), [parsed, settledCaret])
  const suggesting = useMemo(() => indexedFieldOf(caretClause), [caretClause])
  const suggestFilters = useMemo(
    () => (suggesting ? withoutFieldFilter(settled, suggesting) : settled),
    [settled, suggesting],
  )
  const index = useValueIndex(suggesting, suggestFilters, schema)
  const scope = useScopeCounts()
  const suggestions = useMemo(
    () => suggest(parsed, settledCaret, schema, { index, deletedRows: scope.deleted }, caretClause),
    [parsed, settledCaret, schema, index, scope.deleted, caretClause],
  )

  const total = deletedScope ? scope.deleted : scope.live
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

  const directives = useMemo<QueryDirective[]>(
    () => [
      ...(group === null ? [] : [{ label: `group:${group}`, onRemove: () => onGroupChange(null) }]),
      ...(sortParser.eq(sort, DEFAULT_SORT)
        ? []
        : [{ label: `sort:${sortParser.serialize(sort)}`, onRemove: () => onSortChange(DEFAULT_SORT) }]),
    ],
    [group, sort, onGroupChange, onSortChange],
  )

  const onTableSortChange = useCallback((next: Sort) => onSortChange(next ?? DEFAULT_SORT), [onSortChange])
  const onFilter = useCallback(
    (key: string, value: string) => onQueryChange(withValue(parsed, key, value)),
    [onQueryChange, parsed],
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
    group,
    sort,
    actions,
    fieldsOpen,
    suggestions,
    directives,
    parsed,
    resolvedQuery: settled,
    listedFields,
    fieldSearch,
    fieldSearchTerm: fieldSearch.trim().toLowerCase(),
    onCaretChange: setCaret,
    onFieldSearchChange,
    onSortChange,
    onTableSortChange,
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
