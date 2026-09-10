"use client"

import { useCallback, useDeferredValue, useMemo, useState } from "react"
import { chipsOf } from "../query/chips"
import type { FieldCatalog } from "../query/fields"
import { withoutFieldFilter } from "../query/filters"
import { parseQuery } from "../query/parse-query"
import { clauseAt, replaceSpan, withoutClause, withValue } from "../query/query-edits"
import type { FieldStatistics } from "../query/schema"
import type { Sorting } from "../query/sort"
import { indexedFieldOf, suggest } from "../query/suggest"
import { useMatchedDeployments } from "../store/use-deployments"
import { useScopeCounts, useValueIndex } from "../store/use-value-index"
import { useSettledValue } from "./use-settled-value"

const DATA_SETTLE_MS = 120

export type QueryChange = (next: string | ((previous: string) => string)) => void

type QueryInput = {
  query: string
  onQueryChange: QueryChange
  sort: Sorting
  catalog: FieldCatalog
  attributeCounts: FieldStatistics["attributeCounts"]
}

export const useDeploymentQuery = ({ query, onQueryChange, sort, catalog, attributeCounts }: QueryInput) => {
  const [caret, setCaret] = useState(query.length)
  const appliedSource = useSettledValue(query, DATA_SETTLE_MS)
  const appliedDocument = useMemo(() => parseQuery(appliedSource, catalog), [appliedSource, catalog])
  const appliedPlan = appliedDocument.plan
  const draft = useMemo(
    () => (query === appliedSource ? appliedDocument : parseQuery(query, catalog)),
    [query, appliedSource, appliedDocument, catalog],
  )
  const matched = useMatchedDeployments(appliedPlan, sort, catalog)
  const scope = useScopeCounts()

  const deferredCaret = useDeferredValue(caret)
  const activeClause = clauseAt(draft, deferredCaret)
  const activeField = indexedFieldOf(activeClause)
  const completionPlan = useMemo(
    () => (activeField ? withoutFieldFilter(appliedPlan, activeField) : appliedPlan),
    [appliedPlan, activeField],
  )
  const index = useValueIndex(activeField, completionPlan, catalog)
  const suggestions = useMemo(
    () => suggest(draft, deferredCaret, catalog, { index, deletedRows: scope.deleted, attributeCounts }, activeClause),
    [draft, deferredCaret, catalog, index, scope.deleted, attributeCounts, activeClause],
  )
  const chips = useMemo(
    () =>
      chipsOf(draft).map((chip) => ({
        key: chip.key,
        label: chip.label,
        variant: chip.variant,
        issue: chip.issue,
        onRemove: () => onQueryChange(chip.span ? withoutClause(draft, chip.span) : ""),
      })),
    [draft, onQueryChange],
  )

  const onSuggestionSelect = useCallback(
    (insert: string): number => {
      const next = replaceSpan(query, suggestions.span, insert)
      onQueryChange(next.query)
      return next.caret
    },
    [query, suggestions.span, onQueryChange],
  )
  const onFilter = useCallback(
    (key: string, value: string) => onQueryChange(withValue(draft, key, value)),
    [draft, onQueryChange],
  )
  const onClear = useCallback(() => onQueryChange(""), [onQueryChange])

  return {
    editor: {
      query,
      suggestions: { items: suggestions.items, preselect: suggestions.preselect },
      onQueryChange,
      onCaretChange: setCaret,
      onSuggestionSelect,
    },
    chips,
    onFilter,
    onClear,
    appliedPlan,
    matched,
    scope,
  }
}
