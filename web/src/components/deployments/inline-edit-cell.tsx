"use client"

import { useEffect, useRef, useState } from "react"
import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
} from "@/components/ui/autocomplete"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

export type ValueOption = { value: string; count: number }

export function InlineEditor({
  value,
  options,
  mono,
  onCommit,
  onCancel,
}: {
  value: string
  options?: ValueOption[]
  mono?: boolean
  onCommit: (next: string) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  const commit = (v = draft) => onCommit(v.trim())
  const keyHandler = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onCancel()
  }
  if (options && options.length > 0) {
    const filtered = options.filter((o) => o.value.toLowerCase().includes(draft.toLowerCase()))
    return (
      <Autocomplete
        items={filtered}
        filter={null}
        itemToStringValue={(o: ValueOption) => o.value}
        value={draft}
        onValueChange={(v: string, details) => {
          setDraft(v)
          if (details.reason === "item-press") commit(v)
        }}
        autoHighlight
        defaultOpen
      >
        <AutocompleteInput
          ref={ref}
          className={cn("h-7 text-sm", mono && "font-mono")}
          aria-label="Edit value"
          autoComplete="off"
          spellCheck={false}
          onBlur={() => commit()}
          onKeyDown={(e) => {
            keyHandler(e)
            if (e.key === "Enter" && !e.defaultPrevented && filtered.length === 0) commit()
          }}
        />
        <AutocompleteContent className="min-w-48">
          <AutocompleteList>
            {(o: ValueOption) => (
              <AutocompleteItem key={o.value} value={o}>
                <span className="font-mono text-xs">{o.value}</span>
                <span className="ml-auto font-mono text-[11px] text-muted-foreground tabular-nums">{o.count}</span>
              </AutocompleteItem>
            )}
          </AutocompleteList>
        </AutocompleteContent>
      </Autocomplete>
    )
  }
  return (
    <Input
      ref={ref}
      value={draft}
      autoComplete="off"
      spellCheck={false}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => commit()}
      onKeyDown={(e) => {
        keyHandler(e)
        if (e.key === "Enter") commit()
      }}
      className={cn("h-7 px-1.5 text-sm", mono && "font-mono")}
      aria-label="Edit value"
    />
  )
}

export function InlineEditCell({
  value,
  pending,
  readOnly,
  placeholder,
  mono,
  muted,
  options,
  onSave,
}: {
  value: string
  pending?: boolean
  readOnly?: boolean
  placeholder?: string
  mono?: boolean
  muted?: boolean
  options?: ValueOption[]
  onSave: (next: string) => void
}) {
  const [editing, setEditing] = useState(false)
  if (editing) {
    return (
      <InlineEditor
        value={value}
        options={options}
        mono={mono}
        onCommit={(next) => {
          setEditing(false)
          if (next !== value) onSave(next)
        }}
        onCancel={() => setEditing(false)}
      />
    )
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      disabled={readOnly}
      className={cn(
        "flex h-7 w-full min-w-0 items-center gap-1.5 rounded-sm px-1.5 text-left hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none",
        mono && "font-mono text-xs",
        muted && value && "text-muted-foreground",
        !value && "text-muted-foreground/60",
      )}
      title={readOnly ? undefined : "Click to edit"}
    >
      <span className="truncate">{value || placeholder}</span>
      {pending && <Spinner className="size-3 shrink-0 text-muted-foreground" />}
    </button>
  )
}
