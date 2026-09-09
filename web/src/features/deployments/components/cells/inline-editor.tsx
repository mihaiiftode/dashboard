"use client"

import { useEffect, useRef, useState, type KeyboardEvent } from "react"
import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
} from "@/components/ui/autocomplete"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { ValueOption } from "../../query/schema"

type InlineEditorProps = {
  value: string
  options?: ValueOption[]
  mono?: boolean
  onCommit: (next: string) => void
  onCancel: () => void
}

export const InlineEditor = ({ value, options, mono, onCommit, onCancel }: InlineEditorProps) => {
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  const commit = (next = draft) => onCommit(next.trim())
  const cancelOnEscape = (event: KeyboardEvent) => {
    if (event.key === "Escape") onCancel()
  }
  if (options && options.length > 0) {
    const filtered =
      draft === value ? options : options.filter((option) => option.value.toLowerCase().includes(draft.toLowerCase()))
    return (
      <Autocomplete
        items={filtered}
        filter={null}
        itemToStringValue={(option: ValueOption) => option.value}
        value={draft}
        onValueChange={(next: string, details) => {
          setDraft(next)
          if (details.reason === "item-press") commit(next)
        }}
        autoHighlight
        defaultOpen
      >
        <AutocompleteInput
          ref={ref}
          data-slot="cell-editor"
          className={cn("h-7 text-sm", mono && "font-mono")}
          aria-label="Edit value"
          autoComplete="off"
          spellCheck={false}
          onBlur={() => commit()}
          onKeyDown={(event) => {
            cancelOnEscape(event)
            if (event.key === "Enter" && !event.defaultPrevented && filtered.length === 0) commit()
          }}
        />
        <AutocompleteContent className="min-w-48">
          <AutocompleteList>
            {(option: ValueOption) => (
              <AutocompleteItem key={option.value} value={option}>
                <span className="font-mono text-xs">{option.value}</span>
                <span className="ml-auto font-mono text-[11px] text-muted-foreground tabular-nums">{option.count}</span>
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
      data-slot="cell-editor"
      value={draft}
      autoComplete="off"
      spellCheck={false}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => commit()}
      onKeyDown={(event) => {
        cancelOnEscape(event)
        if (event.key === "Enter") commit()
      }}
      className={cn("h-7 px-1.5 text-sm", mono && "font-mono")}
      aria-label="Edit value"
    />
  )
}
