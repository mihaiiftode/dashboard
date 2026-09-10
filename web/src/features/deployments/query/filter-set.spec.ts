import { describe, expect, it } from "vitest"
import { deployments } from "@/test/deployments"
import { FilterKind, FilterOperator } from "./filters"
import { clauseAt, parseQuery, replaceSpan, withoutClause, withValue, quoteValue } from "./filter-set"
import { buildSchema } from "./schema"

const rows = deployments(12)
const schema = buildSchema(rows)

const setOf = (query: string) => parseQuery(query, schema)
const clausesOf = (query: string) => setOf(query).clauses.map((clause) => clause.text)
const firstFilter = (query: string) => setOf(query).filters[0]
const issuesOf = (query: string) => setOf(query).clauses.flatMap((clause) => (clause.issue ? [clause.text] : []))

describe("parseQuery", () => {
  it("reads a valid query without reporting a syntax issue", () => {
    expect(setOf("status:failed").syntaxIssue).toBeNull()
  })

  it("reports a syntax issue and no clauses instead of throwing", () => {
    const parsed = setOf("status:(")

    expect(parsed.syntaxIssue).not.toBeNull()
    expect(parsed.clauses).toEqual([])
  })

  it("reads an empty query as no clauses", () => {
    expect(clausesOf("")).toEqual([])
  })

  it("flattens a conjunction so every clause gets its own chip", () => {
    expect(clausesOf("payment status:failed team:payments")).toEqual(["payment", "status:failed", "team:payments"])
  })

  it("keeps a disjunction together as one clause", () => {
    expect(clausesOf("(status:failed OR status:stopped) team:payments")).toEqual([
      "(status:failed OR status:stopped)",
      "team:payments",
    ])
  })

  it("narrows by nothing when the only text is blank", () => {
    expect(setOf('  ""  ').filters).toEqual([])
  })
})

describe("resolving a clause against the fields", () => {
  it("resolves an alias to its canonical field and matches a facet exactly", () => {
    expect(firstFilter("environment:PROD")).toMatchObject({
      kind: FilterKind.Field,
      field: { key: "env" },
      value: "production",
      operator: FilterOperator.Equals,
    })
  })

  it("normalises a text value and wraps a negated clause", () => {
    expect(firstFilter("-team:PAYMENTS")).toMatchObject({
      kind: FilterKind.Not,
      operand: { kind: FilterKind.Field, field: { key: "team" }, value: "payments", operator: FilterOperator.Contains },
    })
  })

  it("preserves a glob without normalising it", () => {
    expect(firstFilter("env:prod*")).toMatchObject({ value: "prod*", operator: FilterOperator.Glob })
  })

  it("resolves a calendar day to the bounds of that day", () => {
    expect(firstFilter("created:2026-09-10")).toMatchObject({
      kind: FilterKind.Date,
      field: { key: "created" },
      from: "2026-09-10T00:00:00.000Z",
      to: "2026-09-11T00:00:00.000Z",
    })
  })

  it.each([
    ["created:<2026-09-10", { from: null, to: "2026-09-10T00:00:00.000Z" }],
    ["created:>2026-09-10", { from: "2026-09-11T00:00:00.000Z", to: null }],
    ["created:>=2026-09-10", { from: "2026-09-10T00:00:00.000Z", to: null }],
    ["created:<=2026-09-10", { from: null, to: "2026-09-11T00:00:00.000Z" }],
  ])("bounds %s open-endedly", (query, bounds) => {
    expect(firstFilter(query)).toMatchObject(bounds)
  })

  it.each(["nonsense:1", "status:", "created:2026-02-30", "created:not-a-day", "is:archived"])(
    "keeps %s as a clause and marks it",
    (query) => {
      expect(issuesOf(query)).toEqual([query])
      expect(setOf(query).filters).toEqual([])
    },
  )
})

describe("scope", () => {
  it.each([
    ["is:deleted", "deleted"],
    ["-is:deleted", "live"],
    ["", "live"],
    ["is:deleted -is:deleted", "deleted"],
  ])("reads the scope of %s as %s", (query, scope) => {
    expect(setOf(query).scope).toBe(scope)
  })

  it("keeps the scope clause out of the filters", () => {
    const parsed = setOf("is:deleted status:failed")

    expect(parsed.filters).toHaveLength(1)
    expect(parsed.clauses).toHaveLength(2)
  })
})

describe("clauseAt", () => {
  it("finds the clause the caret sits inside", () => {
    const parsed = setOf("status:failed team:pay")

    expect(clauseAt(parsed, 4)?.key).toBe("status")
    expect(clauseAt(parsed, 22)?.key).toBe("team")
  })

  it("reads no clause when the caret sits past the last one", () => {
    expect(clauseAt(setOf("status:failed "), 14)).toBeNull()
  })

  it("excludes the negation from the span a suggestion replaces", () => {
    const clause = clauseAt(setOf("-status:fai"), 11)

    expect(clause?.span.start).toBe(0)
    expect(clause?.prefix).toBe("-")
  })
})

describe("replaceSpan", () => {
  it("replaces the span and reports the new caret", () => {
    const clause = clauseAt(setOf("status:fa"), 9)

    expect(replaceSpan("status:fa", clause?.span ?? null, "status:failed")).toEqual({
      query: "status:failed",
      caret: 13,
    })
  })

  it("appends with a separating space when there is no span", () => {
    expect(replaceSpan("status:failed", null, "team:payments")).toEqual({
      query: "status:failed team:payments",
      caret: 27,
    })
  })

  it("reports the prefix a negated clause must keep when its value is replaced", () => {
    const clause = clauseAt(setOf("-status:fai"), 11)

    expect(replaceSpan("-status:fai", clause?.span ?? null, (clause?.prefix ?? "") + "status:failed").query).toBe(
      "-status:failed",
    )
  })
})

describe("withoutClause", () => {
  it("drops the clause at the given span and keeps the rest verbatim", () => {
    const query = 'payment status:failed team:"release team"'
    const parsed = setOf(query)

    expect(withoutClause(parsed, parsed.clauses[1].span)).toBe('payment team:"release team"')
  })

  it("removes only the occurrence the span points at when a clause repeats", () => {
    const parsed = setOf("status:failed status:failed")

    expect(withoutClause(parsed, parsed.clauses[1].span)).toBe("status:failed")
  })
})

describe("quoteValue", () => {
  it("leaves a value that lexes as one term alone", () => {
    expect(quoteValue("payments")).toBe("payments")
  })

  it("quotes a boolean keyword so it reads as a value", () => {
    expect(quoteValue("OR")).toBe('"OR"')
  })

  it("round trips values carrying spaces, commas, quotes, and backslashes", () => {
    for (const value of ["release team", "a,b", 'say "hi" now', "C:\\temp\\"]) {
      expect(firstFilter(`team:${quoteValue(value)}`)).toMatchObject({ value: value.toLowerCase() })
    }
  })
})

describe("withValue", () => {
  it("adds a clause when the field is absent", () => {
    expect(withValue(setOf("payment"), "status", "failed")).toBe("payment status:failed")
  })

  it("replaces the clause already filtering that field", () => {
    expect(withValue(setOf("status:failed"), "status", "stopped")).toBe("status:stopped")
  })

  it("replaces a negated clause for the same field", () => {
    expect(withValue(setOf("-status:failed"), "status", "stopped")).toBe("status:stopped")
  })

  it("leaves the query untouched when the value is already there", () => {
    expect(withValue(setOf("status:failed"), "status", "failed")).toBe("status:failed")
  })

  it("quotes a value that would otherwise lex as two terms", () => {
    expect(withValue(setOf(""), "name", "order gateway")).toBe('name:"order gateway"')
  })

  it("writes a negated clause when asked", () => {
    expect(withValue(setOf(""), "status", "failed", true)).toBe("-status:failed")
  })

  it("keeps every query it generates parsable", () => {
    const built = withValue(setOf(withValue(setOf(""), "team", "release team")), "name", 'say "hi"')

    expect(setOf(built).syntaxIssue).toBeNull()
  })
})
