"use client"

import { cn } from "@/lib/utils"
import type { ValueOption } from "../table/field-presentation"
import { InlineEditor } from "./inline-editor"
import { useCellEditing } from "./use-cell-editing"
import { CellTrigger } from "./cell-trigger"

type InlineEditCellProps = {
  label: string
  value: string
  pending?: boolean
  readOnly?: boolean
  placeholder?: string
  mono?: boolean
  muted?: boolean
  options?: ValueOption[]
  onCommit: (next: string) => void
}

export const InlineEditCell = ({
  label,
  value,
  pending,
  readOnly,
  placeholder,
  mono,
  muted,
  options,
  onCommit,
}: InlineEditCellProps) => {
  const editor = useCellEditing(value, onCommit)
  if (editor.editing) {
    return (
      <InlineEditor value={value} options={options} mono={mono} onCommit={editor.commit} onCancel={editor.cancel} />
    )
  }
  return (
    <CellTrigger
      editLabel={value ? `Edit ${label}: ${value}` : `Set ${label}`}
      hint="Click to edit"
      readOnly={readOnly}
      pending={pending}
      onStart={editor.start}
      className={cn(
        mono && "font-mono text-xs",
        muted && value && "text-muted-foreground",
        !value && "text-muted-foreground/60",
      )}
    >
      <span className="truncate">{value || placeholder}</span>
    </CellTrigger>
  )
}
