"use client"

import { useMemo } from "react"
import { XIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { withoutClause, type FilterSet } from "../query/filter-set"

export type QueryDirective = { label: string; onRemove: () => void }

export type QueryChipsProps = {
  query: FilterSet
  directives: readonly QueryDirective[]
  onQueryChange: (next: string) => void
}

type ChipVariant = "destructive" | "outline" | "secondary"

type Chip = { key: string; label: string; variant: ChipVariant; issue?: string; onRemove: () => void }

export const QueryChips = ({ query, directives, onQueryChange }: QueryChipsProps) => {
  const chips = useMemo(
    () => [...clauseChips(query, onQueryChange), ...directiveChips(directives)],
    [query, directives, onQueryChange],
  )
  if (chips.length === 0) return null
  return (
    <div data-slot="query-chips" className="flex flex-wrap items-center gap-1.5 border-b bg-background px-4 py-1.5">
      {chips.map((chip) => (
        <QueryChip key={chip.key} chip={chip} />
      ))}
      <Button variant="link" size="xs" onClick={() => onQueryChange("")}>
        Clear
      </Button>
    </div>
  )
}

const clauseChips = (query: FilterSet, onQueryChange: (next: string) => void): Chip[] => {
  if (query.syntaxIssue !== null) {
    return query.source.trim() === ""
      ? []
      : [
          {
            key: "syntax",
            label: query.source,
            variant: "destructive",
            issue: query.syntaxIssue,
            onRemove: () => onQueryChange(""),
          },
        ]
  }
  return query.clauses.map((clause) => ({
    key: String(clause.span.start),
    label: clause.key === null ? "“" + clause.text + "”" : clause.text,
    variant: clause.issue ? "destructive" : clause.key === null ? "outline" : "secondary",
    issue: clause.issue ?? undefined,
    onRemove: () => onQueryChange(withoutClause(query, clause.span)),
  }))
}

const directiveChips = (directives: readonly QueryDirective[]): Chip[] =>
  directives.map((directive) => ({
    key: directive.label,
    label: directive.label,
    variant: "secondary",
    onRemove: directive.onRemove,
  }))

const QueryChip = ({ chip }: { chip: Chip }) => {
  const badge = (
    <Badge data-slot="query-chip" variant={chip.variant} className="gap-1 pr-1 font-mono text-[11px]">
      {chip.label}
      <Button
        variant="ghost"
        size="icon-xs"
        className="size-4"
        aria-label={`Remove ${chip.label}`}
        onClick={chip.onRemove}
      >
        <XIcon />
      </Button>
    </Badge>
  )
  return chip.issue ? (
    <Tooltip>
      <TooltipTrigger render={<span />}>{badge}</TooltipTrigger>
      <TooltipContent>{chip.issue}</TooltipContent>
    </Tooltip>
  ) : (
    badge
  )
}
