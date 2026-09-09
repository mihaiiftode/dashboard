import { describe, expect, it } from "vitest"
import { deployment, deployments } from "@/test/deployments"
import { applyFilters, haystack, resolve, showsDeleted, sortRows } from "./apply"
import { parse } from "./grammar"
import { buildSchema, groupCandidates } from "./schema"

const rows = deployments(12)
const schema = buildSchema(rows)

const resolved = (query: string, over = rows) => resolve(parse(query), buildSchema(over))
const namesFor = (query: string, over = rows) => {
  const scoped = buildSchema(over)
  const state = resolve(parse(query), scoped)
  return applyFilters(sortRows(over, state.sort, scoped), state.filters, scoped).map((row) => row.attributes.name)
}

describe("resolve", () => {
  it("keeps a known field token as a filter", () => {
    expect(resolved("status:failed").filters).toHaveLength(1)
    expect(resolved("status:failed").invalid).toHaveLength(0)
  })

  it("rejects an unknown key", () => {
    expect(resolved("nonsense:1").invalid.map((token) => token.raw)).toEqual(["nonsense:1"])
    expect(resolved("nonsense:1").filters).toHaveLength(0)
  })

  it("rejects a field token with no value", () => {
    expect(resolved("status:").invalid.map((token) => token.raw)).toEqual(["status:"])
  })

  it("resolves aliases to their canonical field", () => {
    expect(resolved("environment:production").filters).toHaveLength(1)
    expect(resolved("sort:created_at").sort).toEqual({ key: "created", desc: false })
  })

  it("lifts the grouping directive out of the filters", () => {
    const state = resolved("group:team status:failed")
    expect(state.group).toBe("team")
    expect(state.filters).toHaveLength(1)
  })

  it("lifts the sort directive and its direction", () => {
    expect(resolved("sort:-name").sort).toEqual({ key: "name", desc: true })
  })

  it("rejects grouping or sorting on an unknown field", () => {
    expect(resolved("group:nope").invalid).toHaveLength(1)
    expect(resolved("sort:nope").invalid).toHaveLength(1)
  })

  it("accepts key presence only for attribute keys present in the data", () => {
    expect(resolved("has:team").filters).toHaveLength(1)
    expect(resolved("has:nothing").invalid).toHaveLength(1)
  })

  it("accepts the deleted scope and rejects any other scope", () => {
    expect(resolved("is:deleted").filters).toHaveLength(1)
    expect(resolved("is:archived").invalid).toHaveLength(1)
  })

  it("ignores whitespace-only text", () => {
    expect(resolved('  ""  ').filters).toHaveLength(0)
  })
})

describe("haystack", () => {
  it("finds a service by a fragment of its name", () => {
    expect(haystack(deployment(7))).toContain("service-007")
  })

  it("covers the identifier, version, creator, and every attribute value", () => {
    const row = deployment(3, { attributes: { team: "payments" } })
    const text = haystack(row)
    expect(text).toContain(row.deployment_id)
    expect(text).toContain(row.version)
    expect(text).toContain(row.created_by)
    expect(text).toContain("payments")
  })
})

describe("applyFilters", () => {
  it("narrows bare text to a contains match anywhere in the haystack", () => {
    expect(namesFor("vice-004")).toEqual(["service-004"])
  })

  it("finds a deployment by a fragment from the middle of its identifier", () => {
    const target = rows[5]
    const fragment = target.deployment_id.slice(20, 30)
    expect(namesFor(fragment)).toEqual([target.attributes.name])
  })

  it("matches a facet exactly and through an alias", () => {
    const exact = namesFor("env:production")
    expect(exact.length).toBeGreaterThan(0)
    expect(namesFor("env:prod")).toEqual(exact)
  })

  it("treats commas as alternatives and spaces as conjunction", () => {
    const either = namesFor("status:failed,stopped")
    const both = namesFor("status:failed type:worker")
    expect(either.length).toBeGreaterThan(namesFor("status:failed").length)
    expect(both.every((name) => either.includes(name) || true)).toBe(true)
    expect(both.length).toBeLessThanOrEqual(namesFor("status:failed").length)
  })

  it("excludes matches for a negated token", () => {
    const all = namesFor("")
    const withoutFailed = namesFor("-status:failed")
    expect(withoutFailed).toEqual(all.filter((name) => !namesFor("status:failed").includes(name)))
  })

  it("matches a glob against the whole value", () => {
    expect(namesFor("name:service-00*")).toEqual(
      rows.filter((row) => row.attributes.name.startsWith("service-00")).map((row) => row.attributes.name),
    )
  })

  it("matches a quoted value containing a space", () => {
    const spaced = deployment(99, { attributes: { name: "order gateway" } })
    expect(namesFor('name:"order gateway"', [spaced])).toEqual(["order gateway"])
  })

  it("compares relative dates against the age of the field", () => {
    const fresh = deployment(1, { created_at: new Date().toISOString() })
    const old = deployment(2, { created_at: new Date(Date.now() - 30 * 86400e3).toISOString() })
    expect(namesFor("created:<7d", [fresh, old])).toEqual([fresh.attributes.name])
    expect(namesFor("created:>7d", [fresh, old])).toEqual([old.attributes.name])
  })

  it("filters on attribute presence and absence", () => {
    const withKey = deployment(1, { attributes: { oncall: "on@example.com" } })
    const withoutKey = deployment(2)
    expect(namesFor("has:oncall", [withKey, withoutKey])).toEqual([withKey.attributes.name])
    expect(namesFor("-has:oncall", [withKey, withoutKey])).toEqual([withoutKey.attributes.name])
  })

  it("hides deleted deployments by default and shows only them under the deleted scope", () => {
    const live = deployment(1)
    const gone = deployment(2, { deleted_at: "2026-03-02T09:00:00.000Z" })
    expect(namesFor("", [live, gone])).toEqual([live.attributes.name])
    expect(namesFor("is:deleted", [live, gone])).toEqual([gone.attributes.name])
  })
})

describe("showsDeleted", () => {
  it("is true only for the unnegated deleted scope", () => {
    expect(showsDeleted(resolved("is:deleted").filters)).toBe(true)
    expect(showsDeleted(resolved("-is:deleted").filters)).toBe(false)
    expect(showsDeleted(resolved("").filters)).toBe(false)
  })
})

describe("sortRows", () => {
  it("orders by the requested field ascending and descending", () => {
    const ascending = sortRows(rows, { key: "name", desc: false }, schema).map((row) => row.attributes.name)
    const descending = sortRows(rows, { key: "name", desc: true }, schema).map((row) => row.attributes.name)
    expect(ascending).toEqual([...ascending].sort())
    expect(descending).toEqual([...ascending].reverse())
  })

  it("puts rows missing the field last", () => {
    const withKey = deployment(1, { attributes: { oncall: "on@example.com" } })
    const withoutKey = deployment(2)
    const scoped = buildSchema([withKey, withoutKey])
    const ordered = sortRows([withoutKey, withKey], { key: "oncall", desc: false }, scoped)
    expect(ordered.map((row) => row.attributes.name)).toEqual([withKey.attributes.name, withoutKey.attributes.name])
  })
})

describe("groupCandidates", () => {
  it("offers every facet and attribute but never a date or the identifier", () => {
    const offered = groupCandidates(schema).map((field) => field.key)

    expect(offered).toContain("status")
    expect(offered).toContain("team")
    expect(offered).not.toContain("created")
    expect(offered).not.toContain("deleted")
    expect(offered).not.toContain("id")
  })
})
