"use client"

import { useMemo } from "react"
import { useLiveQuery } from "@tanstack/react-db"
import type { QueryPlan } from "../query/filters"
import { compileScopeCounts, compileValueIndex } from "../query/compile"
import type { Field, FieldCatalog } from "../query/fields"
import { valueIndexOf, type ValueIndex } from "../query/value-index"
import { useDeploymentsCollection } from "./store-context"

export type ScopeCounts = { live: number; deleted: number }

export const useValueIndex = (field: Field | null, plan: QueryPlan, catalog: FieldCatalog): ValueIndex => {
  const collection = useDeploymentsCollection()
  const { data } = useLiveQuery(
    (query) => (field ? compileValueIndex(query.from({ deployment: collection }), field, plan, catalog) : undefined),
    [collection, field, plan, catalog],
  )
  return useMemo(() => valueIndexOf(data ?? []), [data])
}

export const useScopeCounts = (): ScopeCounts => {
  const collection = useDeploymentsCollection()
  const { data } = useLiveQuery((query) => compileScopeCounts(query.from({ deployment: collection })), [collection])
  return useMemo(() => scopeCountsOf(data), [data])
}

const scopeCountsOf = (groups: readonly unknown[] | undefined): ScopeCounts => {
  const counts = { live: 0, deleted: 0 }
  for (const group of groups ?? []) {
    const { live, rows } = group as { live?: unknown; rows?: unknown }
    if (typeof rows !== "number") continue
    if (live === true) counts.live += rows
    else counts.deleted += rows
  }
  return counts
}
