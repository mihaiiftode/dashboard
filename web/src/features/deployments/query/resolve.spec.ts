import { describe, expect, it } from "vitest"
import { deployments } from "@/test/deployments"
import { resolve, showsDeleted } from "./resolve"
import { parse } from "./grammar"
import { buildSchema, groupCandidates } from "./schema"

const rows = deployments(12)
const schema = buildSchema(rows)

const resolved = (query: string, over = rows) => resolve(parse(query), buildSchema(over))
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

describe("showsDeleted", () => {
  it("is true only for the unnegated deleted scope", () => {
    expect(showsDeleted(resolved("is:deleted").filters)).toBe(true)
    expect(showsDeleted(resolved("-is:deleted").filters)).toBe(false)
    expect(showsDeleted(resolved("").filters)).toBe(false)
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
