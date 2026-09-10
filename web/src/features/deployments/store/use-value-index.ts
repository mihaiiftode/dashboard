"use client"

import { useMemo } from "react"
import { useLiveQuery } from "@tanstack/react-db"
import type { QueryPlan } from "../query/filters"
import { compileScopeCounts, compileValueIndex } from "../query/compile"
import type { Field, FieldCatalog } from "../query/fields"
import { valueIndexOf, type ValueIndex } from "../query/value-index"
import { useDeploymentsCollection } from "./store-context"

export type ScopeCounts = { live: number; deleted: number }

export const useValueIndex = (
  field: Field | null,
  plan: QueryPlan,
  catalog: FieldCatalog,
  cutoff: number,
): ValueIndex => {
  const collection = useDeploymentsCollection()
  const { data } = useLiveQuery({
    queryKey: ["deployment-value-index", collection.id, field, plan, catalog.attributeKeys, cutoff],
    query: (query) =>
      field ? compileValueIndex(query.from({ deployment: collection }), field, plan, catalog, cutoff) : undefined,
  })
  return useMemo(() => valueIndexOf(data ?? []), [data])
}

export const useScopeCounts = (cutoff: number): ScopeCounts => {
  const collection = useDeploymentsCollection()
  const { data } = useLiveQuery({
    queryKey: ["deployment-scope-counts", collection.id, cutoff],
    query: (query) => compileScopeCounts(query.from({ deployment: collection }), cutoff),
  })
  return useMemo(() => scopeCountsOf(data), [data])
}

type ScopeGroup = { live: boolean; rows: number }

const scopeCountsOf = (groups: readonly ScopeGroup[] | undefined): ScopeCounts => {
  const counts = { live: 0, deleted: 0 }
  for (const group of groups ?? []) {
    if (group.live) counts.live += group.rows
    else counts.deleted += group.rows
  }
  return counts
}
