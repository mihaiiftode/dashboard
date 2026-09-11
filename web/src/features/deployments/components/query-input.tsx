"use client"

import { useCallback, useRef, useState } from "react"
import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteEmpty,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
} from "@/components/ui/autocomplete"
import { Kbd } from "@/components/ui/kbd"
import { cn } from "@/lib/utils"
import type { Suggestion, SuggestionKind, Suggestions } from "../query/suggest"

const KIND_CLASS: Record<SuggestionKind, string> = {
  key: "text-foreground",
  value: "text-foreground",
  anywhere: "text-muted-foreground italic",
  directive: "text-muted-foreground",
}

const PLACEHOLDER = "Search, or filter like status:failed team:payments -env:prod…"
const ITEM_PRESS = "item-press"

export type QueryInputProps = {
  inputId: string
  query: string
  suggestions: Pick<Suggestions, "items" | "preselect">
  onQueryChange: (next: string) => void
  onCaretChange: (caret: number) => void
  onSuggestionSelect: (insert: string) => number
}

export const QueryInput = ({
  inputId,
  query,
  suggestions,
  onQueryChange,
  onCaretChange,
  onSuggestionSelect,
}: QueryInputProps) => {
  const [open, setOpen] = useState(false)
  const highlighted = useRef<Suggestion | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const { items, preselect } = suggestions

  const syncCaret = useCallback(() => {
    const input = inputRef.current
    if (input) onCaretChange(input.selectionStart ?? input.value.length)
  }, [onCaretChange])

  const placeCaret = (position: number) => {
    onCaretChange(position)
    requestAnimationFrame(() => {
      const input = inputRef.current
      if (!input) return
      input.focus()
      input.setSelectionRange(position, position)
    })
  }

  return (
    <Autocomplete
      items={items}
      filter={null}
      itemToStringValue={(item: Suggestion) => item.insert}
      value={query}
      onValueChange={(value: string, details) => {
        if (details.reason === ITEM_PRESS) {
          placeCaret(onSuggestionSelect(value))
          return
        }
        onQueryChange(value)
      }}
      autoHighlight={preselect}
      open={open}
      onOpenChange={setOpen}
      onItemHighlighted={(item: Suggestion | undefined) => {
        highlighted.current = item ?? null
      }}
    >
      <AutocompleteInput
        ref={inputRef}
        id={inputId}
        data-slot="query-input"
        placeholder={PLACEHOLDER}
        name="q"
        autoComplete="off"
        spellCheck={false}
        className="w-full font-mono text-sm"
        aria-label="Search and filter deployments"
        onKeyUp={syncCaret}
        onInput={syncCaret}
        onSelect={syncCaret}
        onClick={syncCaret}
        onFocus={() => {
          syncCaret()
          setOpen(true)
        }}
        onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
          if (event.key !== "Tab" || !open) return
          const chosen = highlighted.current ?? items.at(0)
          if (!chosen) return
          event.preventDefault()
          setOpen(false)
          placeCaret(onSuggestionSelect(chosen.insert))
        }}
      >
        <Kbd>/</Kbd>
      </AutocompleteInput>
      <AutocompleteContent className="max-w-2xl">
        <AutocompleteEmpty>No matches for this key</AutocompleteEmpty>
        <AutocompleteList>{(item: Suggestion) => <SuggestionRow key={item.id} item={item} />}</AutocompleteList>
      </AutocompleteContent>
    </Autocomplete>
  )
}

const SuggestionRow = ({ item }: { item: Suggestion }) => (
  <AutocompleteItem value={item} data-slot="query-suggestion">
    <span className={cn("font-mono text-xs", KIND_CLASS[item.kind])}>{item.label}</span>
    {item.detail ? <span className="text-xs text-muted-foreground">{item.detail}</span> : null}
    {item.count === undefined ? null : (
      <span className="ml-auto font-mono text-[11px] text-muted-foreground tabular-nums">
        {item.count.toLocaleString()}
      </span>
    )}
  </AutocompleteItem>
)
