"use client"

import { startTransition, useCallback, useMemo, useState } from "react"
import { columnsFor, type RowActions } from "../components/table/columns"
import { defaultVisible, groupCandidates } from "../components/table/field-presentation"
import type { FieldStatistics } from "../query/schema"
import { useFieldSchema } from "./use-field-schema"
import type { FieldCatalog } from "../query/fields"
import { DEFAULT_SORT, type Sorting } from "../query/sort"
import type { RemovableQueryChip } from "../components/query-chips"
import type { Sort } from "../components/table/deployments-table"
import { useFooterCounts } from "./use-footer-counts"
import { useAllDeployments, useDeploymentWrites } from "../store/use-deployments"
import { useRetentionCutoff } from "../store/use-retention-cutoff"
import { useSyncStatus } from "../store/use-sync-status"
import { sortParser } from "../url"
import { useDeploymentQuery, type QueryChange } from "./use-deployment-query"

export const QUERY_INPUT_ID = "search"

const ALWAYS_VISIBLE = ["name", "description"]

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
  const { catalog, statistics } = useFieldSchema(rows)
  const [chosen, setChosen] = useState<ReadonlySet<string> | null>(null)
  const [fieldsOpen, setFieldsOpen] = useState(false)
  const [fieldSearch, setFieldSearch] = useState("")

  const visible = useMemo(() => chosen ?? new Set(defaultColumns(catalog, statistics)), [chosen, catalog, statistics])
  const cutoff = useRetentionCutoff(rows)
  const search = useDeploymentQuery({
    query,
    onQueryChange,
    sort,
    catalog,
    cutoff,
    attributeCounts: statistics.attributeCounts,
  })
  const { matched, appliedPlan, scope } = search
  const deletedScope = appliedPlan.scope === "deleted"
  const listedFields = useMemo(() => groupCandidates(catalog), [catalog])
  const total = deletedScope ? scope.deleted : scope.live
  const fields = useMemo(
    () =>
      catalog.fields.filter(
        (field) => visible.has(field.key) || field.key === group || (field.key === "deleted" && deletedScope),
      ),
    [catalog, visible, group, deletedScope],
  )
  const hiddenAttributeKeys = useMemo(
    () => catalog.attributeKeys.filter((key) => !visible.has(key) && key !== group),
    [catalog, visible, group],
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

  const chips = useMemo(
    () => [
      ...search.chips,
      ...(group === null ? [] : [directiveChip(`group:${group}`, () => onGroupChange(null))]),
      ...(sortParser.eq(sort, DEFAULT_SORT)
        ? []
        : [directiveChip(`sort:${sortParser.serialize(sort)}`, () => onSortChange(DEFAULT_SORT))]),
    ],
    [search.chips, group, sort, onGroupChange, onSortChange],
  )

  const onTableSortChange = useCallback((next: Sort) => onSortChange(next ?? DEFAULT_SORT), [onSortChange])
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
  const onToggleFields = useCallback(() => startTransition(() => setFieldsOpen((open) => !open)), [])
  const columns = useMemo(
    () => columnsFor(statistics, fields, hiddenAttributeKeys, actions),
    [statistics, fields, hiddenAttributeKeys, actions],
  )
  useFooterCounts(matched.length, total, sync.connection)

  return {
    rows,
    matched,
    catalog,
    cutoff,
    columns,
    pendingIds: writes.pendingIds,
    fields,
    hasAttributesColumn: hiddenAttributeKeys.length > 0,
    visible,
    group,
    sort,
    actions,
    fieldsOpen,
    editor: search.editor,
    chips,
    appliedPlan,
    listedFields,
    fieldSearch,
    fieldSearchTerm: fieldSearch.trim().toLowerCase(),
    onFieldSearchChange,
    onSortChange,
    onTableSortChange,
    onGroupChange,
    onFilter: search.onFilter,
    onClearQuery: search.onClear,
    onToggleColumn,
    onResetColumns,
    onToggleFields,
  }
}

const defaultColumns = (catalog: FieldCatalog, statistics: FieldStatistics) => [
  ...ALWAYS_VISIBLE,
  ...defaultVisible(catalog, statistics),
]

const directiveChip = (label: string, onRemove: () => void): RemovableQueryChip => ({
  key: label,
  label,
  variant: "secondary",
  issue: null,
  onRemove,
})
