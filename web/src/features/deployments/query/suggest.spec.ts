import { describe, expect, it } from "vitest"
import { deployment, deployments } from "@/test/deployments"
import { indexFieldAt, suggest, type SuggestContext } from "./suggest"
import { buildSchema } from "./schema"
import { EMPTY_VALUE_INDEX, valueIndexOf, type ValueIndex } from "./value-index"

const rows = deployments(12)
const schema = buildSchema(rows)

const indexOf = (entries: Record<string, number>): ValueIndex =>
  valueIndexOf(Object.entries(entries).map(([value, count]) => ({ value, rows: count })))

const context = (index: ValueIndex = EMPTY_VALUE_INDEX, deletedRows = 0): SuggestContext => ({
  index,
  deletedRows,
})

const at = (query: string, index?: ValueIndex, deletedRows?: number) =>
  suggest(query, query.length, schema, context(index, deletedRows))

describe("suggest", () => {
  it("offers the field keys that start with what is typed and preselects the first", () => {
    const { items, preselect } = at("st")

    expect(items[0]).toMatchObject({ kind: "key", label: "status:", insert: "status:" })
    expect(preselect).toBe(true)
  })

  it("offers directives alongside field keys", () => {
    expect(at("gr").items.map((item) => item.insert)).toEqual(["group:", "gr"])
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

  it("keeps the values already chosen in a comma list out of the suggestions", () => {
    const { items } = at("status:failed,", indexOf({ active: 7, failed: 3 }))

    expect(items.map((item) => item.insert)).toEqual(["status:failed,active "])
  })

  it("quotes a suggested value that carries a space", () => {
    const { items } = at("team:", indexOf({ "release team": 4 }))

    expect(items[1].insert).toBe('team:"release team" ')
  })

  it("offers the groupable fields for the group directive", () => {
    expect(at("group:te").items.map((item) => item.insert)).toEqual(["group:team "])
  })

  it("offers a descending sort when a minus is typed", () => {
    expect(at("sort:-crea").items.map((item) => item.insert)).toEqual(["sort:-creator ", "sort:-created "])
  })

  it("reports how many rows carry the attribute behind the presence directive", () => {
    const { items, preselect } = at("has:te")

    expect(items).toEqual([expect.objectContaining({ insert: "has:team ", count: schema.attributeCounts.get("team") })])
    expect(preselect).toBe(true)
  })

  it("offers relative ages for a date field", () => {
    expect(at("created:<").items.map((item) => item.insert)).toEqual(["created:<24h ", "created:<7d ", "created:<30d "])
  })

  it("counts the deleted rows behind the deleted scope", () => {
    const { items } = at("is:", EMPTY_VALUE_INDEX, 4)

    expect(items).toEqual([expect.objectContaining({ insert: "is:deleted ", count: 4 })])
  })

  it("offers nothing for a key the schema does not know", () => {
    expect(at("nonsense:").items).toEqual([])
  })

  it("keeps a negation prefix in what it inserts", () => {
    const { items } = at("-status:fai", indexOf({ failed: 3 }))

    expect(items.map((item) => item.insert)).toEqual(["-status:failed "])
  })

  it("suggests against the token under the caret, not the whole query", () => {
    const query = "status:failed team:pay"

    const { span, items } = suggest(query, 17, schema, context(indexOf({ payments: 4 })))

    expect(span?.raw).toBe("team:pay")
    expect(items.some((item) => item.insert.startsWith("team:"))).toBe(true)
  })
})

describe("indexFieldAt", () => {
  it("names the field under the caret", () => {
    expect(indexFieldAt("status:fa", 9, schema)?.key).toBe("status")
  })

  it("names nothing while a key is still being typed", () => {
    expect(indexFieldAt("stat", 4, schema)).toBeNull()
  })

  it("names nothing for a directive, a date, or an identifier", () => {
    expect(indexFieldAt("group:te", 8, schema)).toBeNull()
    expect(indexFieldAt("created:<7", 10, schema)).toBeNull()
    expect(indexFieldAt("id:ab", 5, schema)).toBeNull()
  })

  it("names an attribute key that only one row carries", () => {
    const scoped = buildSchema([deployment(1, { attributes: { oncall: "on@example.com" } }), deployment(2)])

    expect(indexFieldAt("oncall:on", 9, scoped)?.key).toBe("oncall")
  })
})
