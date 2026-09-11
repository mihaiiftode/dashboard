import { describe, expect, it } from "vitest"
import { must } from "@/test/must"
import { deployments } from "@/test/deployments"
import { parseQuery } from "./parse-query"
import { clauseAt, replaceSpan, withoutClause, withValue } from "./query-edits"
import { buildSchema } from "@/test/schema"

const rows = deployments(12)
const { catalog } = buildSchema(rows)

const setOf = (query: string) => parseQuery(query, catalog)

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
    expect(clause?.edit.start).toBe(1)
  })
})

describe("replaceSpan", () => {
  it("replaces the span and reports the new caret", () => {
    const clause = must(clauseAt(setOf("status:fa"), 9), "a clause at the caret")

    expect(replaceSpan("status:fa", clause.span, "status:failed")).toEqual({
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

  it("keeps a negation outside the span a replaced value writes into", () => {
    const clause = must(clauseAt(setOf("-status:fai"), 11), "a clause at the caret")

    expect(replaceSpan("-status:fai", clause.edit, "status:failed").query).toBe("-status:failed")
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

    expect(setOf(built).diagnostics.find((issue) => issue.span === null)).toBeUndefined()
  })
})
