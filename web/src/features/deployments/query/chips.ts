import type { QueryDocument, Span } from "./parse-query"

export type QueryChip = {
  key: string
  label: string
  variant: "destructive" | "outline" | "secondary"
  issue: string | null
  span: Span | null
}

export const chipsOf = (query: QueryDocument): readonly QueryChip[] => {
  const syntaxIssue = query.diagnostics.find((issue) => issue.span === null)
  if (syntaxIssue) {
    return [
      {
        key: "syntax",
        label: query.source,
        variant: "destructive",
        issue: syntaxIssue.message,
        span: null,
      },
    ]
  }
  return query.clauses.map((clause) => {
    const issue = query.diagnostics.find((diagnostic) => diagnostic.span?.start === clause.span.start)
    return {
      key: String(clause.span.start),
      label: clause.key === null ? "“" + clause.text + "”" : clause.text,
      variant: issue ? "destructive" : clause.key === null ? "outline" : "secondary",
      issue: issue?.message ?? null,
      span: clause.span,
    }
  })
}
