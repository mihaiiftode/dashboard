"use client"

import { cn } from "@/lib/utils"
import type { ValueOption } from "../table/field-presentation"
import { ValueChip } from "../value-chip"
import { InlineEditor } from "./inline-editor"
import { useCellEditing } from "./use-cell-editing"
import { CellTrigger } from "./cell-trigger"

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
    <CellTrigger
      editLabel={unset ? `Set ${label}` : `Edit ${label}: ${value}`}
      hint={unset ? `Set ${label}` : "Click to edit"}
      readOnly={readOnly}
      pending={pending}
      onStart={editor.start}
      className={cn(unset && "text-muted-foreground/60")}
    >
      {unset ? "—" : <ValueChip keyName={label} value={value} />}
    </CellTrigger>
  )
}
