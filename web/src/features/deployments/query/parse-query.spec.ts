import { describe, expect, it } from "vitest"
import { deployments } from "@/test/deployments"
import { FilterKind, FilterOperator } from "./filters"
import { parseQuery, quoteValue } from "./parse-query"
import { buildSchema } from "./schema"

const rows = deployments(12)
const { catalog } = buildSchema(rows)

const setOf = (query: string) => parseQuery(query, catalog)
const clausesOf = (query: string) => setOf(query).clauses.map((clause) => clause.text)
const firstFilter = (query: string) => setOf(query).plan.filters[0]
const issuesOf = (query: string) =>
  setOf(query).diagnostics.map((issue) => query.slice(issue.span?.start, issue.span?.end))

describe("parseQuery", () => {
  it("reads a valid query without reporting a syntax issue", () => {
    expect(setOf("status:failed").diagnostics.find((issue) => issue.span === null)).toBeUndefined()
  })

  it("reports a syntax issue and no clauses instead of throwing", () => {
    const parsed = setOf("status:(")

    expect(parsed.diagnostics.find((issue) => issue.span === null)).not.toBeUndefined()
    expect(parsed.clauses).toEqual([])
  })

  it("reads an empty query as no clauses", () => {
    expect(clausesOf("")).toEqual([])
  })

  it("flattens a conjunction so every clause gets its own chip", () => {
    expect(clausesOf("payment status:failed team:payments")).toEqual(["payment", "status:failed", "team:payments"])
  })

  it("keeps a disjunction as one clause and marks it as unsupported", () => {
    const source = "(status:failed OR status:stopped) team:payments"

    expect(clausesOf(source)).toEqual(["(status:failed OR status:stopped)", "team:payments"])
    expect(issuesOf(source)).toEqual(["(status:failed OR status:stopped)"])
    expect(setOf(source).plan.filters).toHaveLength(1)
  })

  it("narrows by nothing when the only text is blank", () => {
    expect(setOf('  ""  ').plan.filters).toEqual([])
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
      from: "2026-09-10T00:00:00.000000Z",
      to: "2026-09-11T00:00:00.000000Z",
    })
  })

  it.each([
    ["created:<2026-09-10", { from: null, to: "2026-09-10T00:00:00.000000Z" }],
    ["created:>2026-09-10", { from: "2026-09-11T00:00:00.000000Z", to: null }],
    ["created:>=2026-09-10", { from: "2026-09-10T00:00:00.000000Z", to: null }],
    ["created:<=2026-09-10", { from: null, to: "2026-09-11T00:00:00.000000Z" }],
  ])("bounds %s open-endedly", (query, bounds) => {
    expect(firstFilter(query)).toMatchObject(bounds)
  })

  it.each(["nonsense:1", "status:", "created:2026-02-30", "created:not-a-day", "is:archived"])(
    "keeps %s as a clause and marks it",
    (query) => {
      expect(issuesOf(query)).toEqual([query])
      expect(setOf(query).plan.filters).toEqual([])
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
    expect(setOf(query).plan.scope).toBe(scope)
  })

  it("keeps the scope clause out of the filters", () => {
    const parsed = setOf("is:deleted status:failed")

    expect(parsed.plan.filters).toHaveLength(1)
    expect(parsed.clauses).toHaveLength(2)
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
