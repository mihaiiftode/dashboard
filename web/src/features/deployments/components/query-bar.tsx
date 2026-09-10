"use client"

import type { ReactNode } from "react"
import type { Suggestions } from "../query/suggest"
import { QueryInput } from "./query-input"

export type QueryBarProps = {
  inputId: string
  query: string
  suggestions: Suggestions
  onQueryChange: (next: string) => void
  onCaretChange: (caret: number) => void
  children?: ReactNode
}

export const QueryBar = ({ inputId, query, suggestions, onQueryChange, onCaretChange, children }: QueryBarProps) => (
  <div data-slot="query-bar" className="flex items-start gap-2 border-b bg-background px-4 py-2">
    <div className="min-w-0 flex-1">
      <QueryInput
        inputId={inputId}
        query={query}
        suggestions={suggestions}
        onQueryChange={onQueryChange}
        onCaretChange={onCaretChange}
      />
    </div>
    {children}
  </div>
)
