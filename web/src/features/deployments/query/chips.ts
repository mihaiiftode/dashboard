import { withoutClause, type Clause, type FilterSet } from "./filter-set"

type ChipVariant = "destructive" | "outline" | "secondary"

export type QueryChip = {
  key: string
  label: string
  variant: ChipVariant
  issue: string | null
  onRemove: () => void
}

export type QueryDirective = { label: string; onRemove: () => void }

enum ClauseAppearance {
  Invalid = "invalid",
  Bare = "bare",
  Field = "field",
}

const VARIANT_OF: Record<ClauseAppearance, ChipVariant> = {
  [ClauseAppearance.Invalid]: "destructive",
  [ClauseAppearance.Bare]: "outline",
  [ClauseAppearance.Field]: "secondary",
}

const appearanceOf = (clause: Clause): ClauseAppearance => {
  if (clause.issue !== null) return ClauseAppearance.Invalid
  if (clause.key === null) return ClauseAppearance.Bare
  return ClauseAppearance.Field
}

const labelOf = (clause: Clause): string => (clause.key === null ? "“" + clause.text + "”" : clause.text)

export const chipsOf = (
  query: FilterSet,
  directives: readonly QueryDirective[],
  onQueryChange: (next: string) => void,
): readonly QueryChip[] => [...clauseChips(query, onQueryChange), ...directiveChips(directives)]

const clauseChips = (query: FilterSet, onQueryChange: (next: string) => void): QueryChip[] => {
  const { syntaxIssue } = query
  if (syntaxIssue !== null) {
    return [
      {
        key: "syntax",
        label: query.source,
        variant: VARIANT_OF[ClauseAppearance.Invalid],
        issue: syntaxIssue,
        onRemove: () => onQueryChange(""),
      },
    ]
  }
  return query.clauses.map((clause) => ({
    key: String(clause.span.start),
    label: labelOf(clause),
    variant: VARIANT_OF[appearanceOf(clause)],
    issue: clause.issue,
    onRemove: () => onQueryChange(withoutClause(query, clause.span)),
  }))
}

const directiveChips = (directives: readonly QueryDirective[]): QueryChip[] =>
  directives.map((directive) => ({
    key: directive.label,
    label: directive.label,
    variant: VARIANT_OF[ClauseAppearance.Field],
    issue: null,
    onRemove: directive.onRemove,
  }))
