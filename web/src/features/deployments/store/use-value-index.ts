"use client"

import { useMemo } from "react"
import { useLiveQuery } from "@tanstack/react-db"
import type { Narrowing } from "../query/filter-set"
import { compileScopeCounts, compileValueIndex } from "../query/compile"
import type { Schema } from "../query/schema"
import type { Field } from "../query/fields"
import { valueIndexOf, type ValueIndex } from "../query/value-index"
import { useDeploymentsCollection } from "./store-context"

export type ScopeCounts = { live: number; deleted: number }

export const useValueIndex = (field: Field | null, resolved: Narrowing, schema: Schema): ValueIndex => {
  const collection = useDeploymentsCollection()
  const { data } = useLiveQuery(
    (query) => (field ? compileValueIndex(query.from({ deployment: collection }), field, resolved, schema) : undefined),
    [collection, field, resolved, schema],
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
