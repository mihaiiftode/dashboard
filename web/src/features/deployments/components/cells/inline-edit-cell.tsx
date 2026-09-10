"use client"

import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import type { ValueOption } from "../table/field-presentation"
import { InlineEditor } from "./inline-editor"
import { CELL_TRIGGER_CLASS, useCellEditing } from "./use-cell-editing"

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
    <button
      type="button"
      data-slot="cell-editor"
      onClick={editor.start}
      disabled={readOnly}
      aria-label={value ? `Edit ${label}: ${value}` : `Set ${label}`}
      title={readOnly ? undefined : "Click to edit"}
      className={cn(
        CELL_TRIGGER_CLASS,
        mono && "font-mono text-xs",
        muted && value && "text-muted-foreground",
        !value && "text-muted-foreground/60",
      )}
    >
      <span className="truncate">{value || placeholder}</span>
      {pending ? <Spinner className="size-3 shrink-0 text-muted-foreground" /> : null}
    </button>
  )
}
