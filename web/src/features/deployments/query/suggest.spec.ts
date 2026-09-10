import { afterEach, describe, expect, it, vi } from "vitest"
import { deployment, deployments } from "@/test/deployments"
import { indexedFieldOf, suggest, type SuggestContext } from "./suggest"
import { buildSchema } from "./schema"
import { EMPTY_VALUE_INDEX, valueIndexOf, type ValueIndex } from "./value-index"
import { parseQuery } from "./parse-query"
import { clauseAt, replaceSpan } from "./query-edits"
import { must } from "@/test/must"

afterEach(() => vi.useRealTimers())

const rows = deployments(12)
const { catalog, statistics } = buildSchema(rows)

const indexOf = (entries: Record<string, number>): ValueIndex =>
  valueIndexOf(Object.entries(entries).map(([value, count]) => ({ value, rows: count })))

const context = (index: ValueIndex = EMPTY_VALUE_INDEX, deletedRows = 0): SuggestContext => ({
  index,
  deletedRows,
  attributeCounts: statistics.attributeCounts,
})

const setOf = (query: string) => parseQuery(query, catalog)

const at = (query: string, index?: ValueIndex, deletedRows?: number) =>
  suggest(setOf(query), query.length, catalog, context(index, deletedRows))

const fieldAt = (query: string, caret: number) => indexedFieldOf(clauseAt(setOf(query), caret))

describe("suggest", () => {
  it("offers the field keys that start with what is typed and preselects the first", () => {
    const { items, preselect } = at("st")

    expect(items[0]).toMatchObject({ kind: "key", label: "status:", insert: "status:" })
    expect(preselect).toBe(true)
  })

  it("offers directives alongside field keys", () => {
    expect(at("is").items.map((item) => item.insert)).toEqual(["is:", "is"])
  })

  it("puts the matches-anywhere row after the keys that match what is typed", () => {
    const { items, preselect } = at("te")

    expect(items[0]).toMatchObject({ kind: "key", insert: "team:" })
    expect(items.at(-1)).toMatchObject({ kind: "anywhere", insert: "te" })
    expect(preselect).toBe(true)
  })

  it("offers only the matches-anywhere row when no key matches, without preselecting it", () => {
    const { items, preselect } = at("zzz")

    expect(items).toHaveLength(1)
    expect(items[0].kind).toBe("anywhere")
    expect(preselect).toBe(false)
  })

  it("counts facet values from the index and preselects the first", () => {
    const { items, preselect } = at("status:", indexOf({ active: 7, failed: 3 }))

    expect(items.map((item) => [item.insert, item.count])).toEqual([
      ["status:active ", 7],
      ["status:failed ", 3],
    ])
    expect(preselect).toBe(true)
  })

  it("narrows facet values by the partial value typed", () => {
    const { items } = at("status:fai", indexOf({ active: 7, failed: 3 }))

    expect(items.map((item) => item.insert)).toEqual(["status:failed "])
  })

  it("leads a string field with the matches-anywhere row and does not preselect it", () => {
    const { items, preselect } = at("name:pay", indexOf({ "payments-api": 2, "payments-worker": 1 }))

    expect(items[0]).toMatchObject({ kind: "anywhere", insert: "name:pay ", count: 3 })
    expect(items.slice(1).map((item) => item.insert)).toEqual(["name:payments-api ", "name:payments-worker "])
    expect(preselect).toBe(false)
  })

  it("quotes a suggested value that carries a space", () => {
    const { items } = at("team:", indexOf({ "release team": 4 }))

    expect(items[1].insert).toBe('team:"release team" ')
  })

  it("offers today's UTC date for the comparators that match what is typed", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-09-10T23:00:00.000Z"))

    expect(at("created:<").items.map((item) => item.insert)).toEqual(["created:<2026-09-10 ", "created:<=2026-09-10 "])
  })

  it("does not interpret a colon inside quoted text as a field", () => {
    expect(fieldAt('"team:pay"', 10)).toBeNull()
  })

  it("counts the deleted rows behind the deleted scope", () => {
    const { items } = at("is:", EMPTY_VALUE_INDEX, 4)

    expect(items).toEqual([expect.objectContaining({ insert: "is:deleted ", count: 4 })])
  })

  it("offers nothing for a key the catalog does not know", () => {
    expect(at("nonsense:").items).toEqual([])
  })

  it("keeps the negation in the query when a suggestion replaces a negated value", () => {
    const query = "-status:fai"
    const { span, items } = at(query, indexOf({ failed: 3 }))

    expect(replaceSpan(query, span, items[0].insert).query).toBe("-status:failed ")
  })

  it("suggests against the token under the caret, not the whole query", () => {
    const query = "status:failed team:pay"

    const { span, items } = suggest(setOf(query), 17, catalog, context(indexOf({ payments: 4 })))

    const replaced = must(span, "a replacement span")

    expect(query.slice(replaced.start, replaced.end)).toBe("team:pay")
    expect(items.some((item) => item.insert.startsWith("team:"))).toBe(true)
  })
})

describe("indexedFieldOf", () => {
  it("names the field under the caret", () => {
    expect(fieldAt("status:fa", 9)?.key).toBe("status")
  })

  it("names nothing while a key is still being typed", () => {
    expect(fieldAt("stat", 4)).toBeNull()
  })

  it("names nothing for a directive, a date, or an identifier", () => {
    expect(fieldAt("created:20", 10)).toBeNull()
    expect(fieldAt("created:<7", 10)).toBeNull()
    expect(fieldAt("id:ab", 5)).toBeNull()
  })

  it("names an attribute key that only one row carries", () => {
    const { catalog: scoped } = buildSchema([
      deployment(1, { attributes: { oncall: "on@example.com" } }),
      deployment(2),
    ])

    expect(indexedFieldOf(clauseAt(parseQuery("oncall:on", scoped), 9))?.key).toBe("oncall")
  })
})

describe("applying a suggestion", () => {
  const applied = (query: string, pick: (label: string) => boolean, index?: ValueIndex) => {
    const suggestions = suggest(
      setOf(query),
      query.length,
      catalog,
      context(index),
      clauseAt(setOf(query), query.length),
    )
    const chosen = suggestions.items.find((item) => pick(item.label))
    if (!chosen) throw new Error(`no suggestion matched in ${JSON.stringify(suggestions.items.map((i) => i.label))}`)
    return replaceSpan(query, suggestions.span, chosen.insert).query
  }

  it("keeps the closing parenthesis around a completed filter", () => {
    expect(applied("(status:fai)", (label) => label.includes("failed"), indexOf({ failed: 3 }))).toBe(
      "(status:failed )",
    )
  })

  it("keeps a wrapping NOT and its parenthesis", () => {
    expect(applied("NOT (status:fai)", (label) => label.includes("failed"), indexOf({ failed: 3 }))).toBe(
      "NOT (status:failed )",
    )
  })

  it("does not double the negation when taking the match-anywhere item", () => {
    expect(applied("-zzz", (label) => label.includes("zzz"))).toBe("-zzz")
  })

  it("preserves an exact comparator when completing its value", () => {
    expect(applied("name:=service", (label) => label.includes("service-001"), indexOf({ "service-001": 1 }))).toBe(
      'name:="service-001" ',
    )
  })
})
