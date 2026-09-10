"use client"

import { useMemo } from "react"
import type { Deployment } from "../store/schema"
import type { FieldCatalog } from "../query/fields"
import { attributeCountsOf, attributeKeysOf, catalogFor, statisticsFor, type FieldStatistics } from "../query/schema"

const KEY_SEPARATOR = " "

export const useFieldSchema = (rows: readonly Deployment[]): { catalog: FieldCatalog; statistics: FieldStatistics } => {
  const attributeCounts = useMemo(() => attributeCountsOf(rows), [rows])
  const signature = useMemo(() => attributeKeysOf(attributeCounts).join(KEY_SEPARATOR), [attributeCounts])
  const catalog = useMemo(() => catalogFor(signature === "" ? [] : signature.split(KEY_SEPARATOR)), [signature])
  const statistics = useMemo(() => statisticsFor(rows, catalog, attributeCounts), [rows, catalog, attributeCounts])
  return { catalog, statistics }
}
