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
  const issueAt = new Map(
    query.diagnostics.flatMap((diagnostic) =>
      diagnostic.span ? [[diagnostic.span.start, diagnostic.message] as const] : [],
    ),
  )
  return query.clauses.map((clause) => {
    const issue = issueAt.get(clause.span.start) ?? null
    return {
      key: String(clause.span.start),
      label: clause.key === null ? "“" + clause.text + "”" : clause.text,
      variant: issue ? "destructive" : clause.key === null ? "outline" : "secondary",
      issue,
      span: clause.span,
    }
  })
}
