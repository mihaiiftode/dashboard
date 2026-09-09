"use client"

import { useState } from "react"
import { Spinner } from "@/components/ui/spinner"
import { InlineEditor, type ValueOption } from "./inline-edit-cell"
import { ValueChip } from "./value-chip"

export function ChipEditCell({
  keyName,
  value,
  options,
  pending,
  readOnly,
  onSave,
}: {
  keyName: string
  value: string | undefined
  options: ValueOption[]
  pending?: boolean
  readOnly?: boolean
  onSave: (next: string) => void
}) {
  const [editing, setEditing] = useState(false)
  if (editing) {
    return (
      <InlineEditor
        value={value ?? ""}
        options={options}
        mono
        onCommit={(next) => {
          setEditing(false)
          if (next !== (value ?? "")) onSave(next)
        }}
        onCancel={() => setEditing(false)}
      />
    )
  }
  if (value === undefined) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        disabled={readOnly}
        className="flex h-7 w-full items-center rounded-sm px-1.5 text-left text-muted-foreground/60 hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none"
        aria-label={`Set ${keyName}`}
        title={readOnly ? undefined : `Set ${keyName}`}
      >
        —
      </button>
    )
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      disabled={readOnly}
      className="flex h-7 w-full min-w-0 items-center gap-1.5 rounded-sm px-1.5 text-left hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none"
      aria-label={`Edit ${keyName}: ${value}`}
      title={readOnly ? undefined : "Click to edit"}
    >
      <ValueChip keyName={keyName} value={value} />
      {pending && <Spinner className="size-3 shrink-0 text-muted-foreground" />}
    </button>
  )
}
