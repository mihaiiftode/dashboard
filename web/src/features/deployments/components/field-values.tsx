"use client"

import { Button } from "@/components/ui/button"
import type { Field } from "../query/fields"
import type { ValueCount } from "../query/value-index"

type FieldValuesProps = {
  field: Field
  values: readonly ValueCount[]
  total: number
  onFilter: (value: string) => void
}

export const FieldValues = ({ field, values, total, onFilter }: FieldValuesProps) => {
  if (values.length === 0) {
    return <span className="px-1.5 text-xs text-muted-foreground">no values in current results</span>
  }
  return values.map((entry) => (
    <Button
      key={entry.value}
      variant="ghost"
      size="xs"
      className="h-6 w-full justify-start gap-2 px-1.5 font-mono text-xs font-normal"
      aria-label={`Filter ${field.key}: ${entry.value}`}
      onClick={() => onFilter(entry.value)}
    >
      <span className="min-w-0 flex-1 truncate text-left">{entry.value}</span>
      <span className="text-[11px] text-muted-foreground tabular-nums">{entry.rows.toLocaleString()}</span>
      <span className="h-1 w-12 overflow-hidden rounded-full bg-muted">
        <span className="block h-full bg-foreground/40" style={{ width: shareOf(entry.rows, total) }} />
      </span>
    </Button>
  ))
}

const shareOf = (rows: number, total: number): string => `${Math.round((rows / Math.max(1, total)) * 100)}%`
