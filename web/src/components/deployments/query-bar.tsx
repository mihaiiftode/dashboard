"use client"

import { type ReactNode, useCallback, useMemo, useRef, useState } from "react"
import { XIcon } from "lucide-react"
import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteEmpty,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
} from "@/components/ui/autocomplete"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { parse, removeToken, replaceSpan, type Token } from "@/lib/query/grammar"
import type { Schema } from "@/lib/query/schema"
import { suggest, type Suggestion } from "@/lib/query/suggest"
import type { Deployment } from "@/lib/types"
import { cn } from "@/lib/utils"

const KIND_CLASS: Record<Suggestion["kind"], string> = {
  key: "text-foreground",
  value: "text-foreground",
  contains: "text-foreground",
  directive: "text-muted-foreground",
  hint: "text-muted-foreground italic",
}

export function QueryBar({
  query,
  onQueryChange,
  rows,
  schema,
  invalid,
  trailing,
}: {
  query: string
  onQueryChange: (q: string) => void
  rows: Deployment[]
  schema: Schema
  invalid: Token[]
  trailing?: ReactNode
}) {
  const [caret, setCaret] = useState(query.length)
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const { span, items } = useMemo(() => suggest(query, caret, rows, schema), [query, caret, rows, schema])
  const tokens = useMemo(() => parse(query), [query])
  const invalidRaw = useMemo(() => new Set(invalid.map((t) => t.raw)), [invalid])

  const syncCaret = useCallback(() => {
    const el = inputRef.current
    if (el) setCaret(el.selectionStart ?? el.value.length)
  }, [])

  const placeCaret = (pos: number) => {
    setCaret(pos)
    requestAnimationFrame(() => {
      const el = inputRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(pos, pos)
    })
  }

  return (
    <div className="flex flex-col gap-2 border-b bg-background px-4 py-2">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <Autocomplete
            items={items}
            filter={null}
            itemToStringValue={(item: Suggestion) => item.insert}
            value={query}
            onValueChange={(value: string, details) => {
              if (details.reason === "item-press") {
                const next = replaceSpan(query, span, value)
                onQueryChange(next.query)
                placeCaret(next.caret)
                return
              }
              onQueryChange(value)
            }}
            autoHighlight={items[0]?.kind !== "contains"}
            open={open}
            onOpenChange={setOpen}
          >
            <AutocompleteInput
              ref={inputRef}
              id="search"
              placeholder="Search, or filter like status:failed team:payments created:<7d group:team…"
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
            >
              <Kbd>/</Kbd>
            </AutocompleteInput>
            <AutocompleteContent className="max-w-2xl">
              <AutocompleteEmpty>No matches for this key</AutocompleteEmpty>
              <AutocompleteList>
                {(item: Suggestion) => (
                  <AutocompleteItem key={item.id} value={item}>
                    <span className={cn("font-mono text-xs", KIND_CLASS[item.kind])}>{item.label}</span>
                    {item.detail && <span className="text-xs text-muted-foreground">{item.detail}</span>}
                    {item.count !== undefined && (
                      <span className="ml-auto font-mono text-[11px] text-muted-foreground tabular-nums">
                        {item.count.toLocaleString()}
                      </span>
                    )}
                  </AutocompleteItem>
                )}
              </AutocompleteList>
            </AutocompleteContent>
          </Autocomplete>
        </div>
        {trailing}
      </div>
      {tokens.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {tokens.map((t, i) => {
            const bad = invalidRaw.has(t.raw)
            const chip = (
              <Badge
                key={`${t.raw}-${i}`}
                variant={bad ? "destructive" : t.kind === "text" ? "outline" : "secondary"}
                className="gap-1 pr-1 font-mono text-[11px]"
              >
                {t.kind === "text" ? `“${t.text}”` : t.raw}
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="size-4"
                  aria-label={`Remove ${t.raw}`}
                  onClick={() => onQueryChange(removeToken(query, t.raw))}
                >
                  <XIcon />
                </Button>
              </Badge>
            )
            return bad ? (
              <Tooltip key={`${t.raw}-${i}`}>
                <TooltipTrigger render={<span />}>{chip}</TooltipTrigger>
                <TooltipContent>Unknown key or empty value, ignored</TooltipContent>
              </Tooltip>
            ) : (
              chip
            )
          })}
          <Button variant="link" size="xs" onClick={() => onQueryChange("")}>
            Clear
          </Button>
        </div>
      )}
    </div>
  )
}
