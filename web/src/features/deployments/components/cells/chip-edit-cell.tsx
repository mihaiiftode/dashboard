"use client"

import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import type { ValueOption } from "../../query/schema"
import { ValueChip } from "../value-chip"
import { InlineEditor } from "./inline-editor"
import { CELL_TRIGGER_CLASS, useCellEditing } from "./use-cell-editing"

type ChipEditCellProps = {
  label: string
  value: string | undefined
  options: ValueOption[]
  pending?: boolean
  readOnly?: boolean
  onCommit: (next: string) => void
}

export const ChipEditCell = ({ label, value, options, pending, readOnly, onCommit }: ChipEditCellProps) => {
  const editor = useCellEditing(value ?? "", onCommit)
  if (editor.editing) {
    return <InlineEditor value={value ?? ""} options={options} mono onCommit={editor.commit} onCancel={editor.cancel} />
  }
  const unset = value === undefined
  return (
    <button
      type="button"
      data-slot="cell-editor"
      onClick={editor.start}
      disabled={readOnly}
      aria-label={unset ? `Set ${label}` : `Edit ${label}: ${value}`}
      title={readOnly ? undefined : unset ? `Set ${label}` : "Click to edit"}
      className={cn(CELL_TRIGGER_CLASS, unset && "text-muted-foreground/60")}
    >
      {unset ? "—" : <ValueChip keyName={label} value={value} />}
      {pending ? <Spinner className="size-3 shrink-0 text-muted-foreground" /> : null}
    </button>
  )
}
