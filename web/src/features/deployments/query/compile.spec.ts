import { createCollection, createLiveQueryCollection, localOnlyCollectionOptions } from "@tanstack/react-db"
import { describe, expect, it } from "vitest"
import { deletedDaysAgo, deployment, deployments } from "@/test/deployments"
import type { Deployment } from "../store/schema"
import { resolve } from "./apply"
import { compileQuery } from "./compile"
import { parse } from "./grammar"
import { buildSchema } from "./schema"

const collectionOver = (rows: Deployment[]) => {
  const collection = createCollection(
    localOnlyCollectionOptions<Deployment>({
      id: `compile-${crypto.randomUUID()}`,
      getKey: (row: Deployment) => row.deployment_id,
      initialData: rows,
    }),
  )
  return collection
}

const namesFor = async (query: string, rows: Deployment[]) => {
  const schema = buildSchema(rows)
  const collection = collectionOver(rows)
  const live = createLiveQueryCollection((builder) =>
    compileQuery(builder.from({ deployment: collection }), resolve(parse(query), schema), schema),
  )
  await live.preload()
  return [...live.values()].map((row) => (row as Deployment).attributes.name)
}

const rows = deployments(12)

describe("compileQuery", () => {
  it("returns every live deployment for an empty query, newest first", async () => {
    expect(await namesFor("", rows)).toEqual([...rows].reverse().map((row) => row.attributes.name))
  })

  it("matches a facet exactly", async () => {
    const failed = rows.filter((row) => row.status === "failed").map((row) => row.attributes.name)
    expect((await namesFor("status:failed", rows)).sort()).toEqual(failed.sort())
  })

  it("treats commas as alternatives", async () => {
    const either = rows
      .filter((row) => row.status === "failed" || row.status === "stopped")
      .map((row) => row.attributes.name)
    expect((await namesFor("status:failed,stopped", rows)).sort()).toEqual(either.sort())
  })

  it("resolves a facet alias", async () => {
    expect((await namesFor("env:prod", rows)).sort()).toEqual((await namesFor("env:production", rows)).sort())
  })

  it("intersects separate tokens", async () => {
    const both = rows
      .filter((row) => row.status === "failed" && row.type === "worker")
      .map((row) => row.attributes.name)
    expect((await namesFor("status:failed type:worker", rows)).sort()).toEqual(both.sort())
  })

  it("excludes a negated token", async () => {
    const rest = rows.filter((row) => row.status !== "failed").map((row) => row.attributes.name)
    expect((await namesFor("-status:failed", rows)).sort()).toEqual(rest.sort())
  })

  it("matches bare text against the haystack", async () => {
    expect(await namesFor("vice-004", rows)).toEqual(["service-004"])
  })

  it("finds a deployment by a fragment from the middle of its identifier", async () => {
    const target = rows[5]
    expect(await namesFor(target.deployment_id.slice(14, 24), rows)).toEqual([target.attributes.name])
  })

  it("matches bare text against an attribute value", async () => {
    const tagged = deployment(1, { attributes: { team: "payments" } })
    const other = deployment(2, { attributes: { team: "search" } })
    expect(await namesFor("payments", [tagged, other])).toEqual([tagged.attributes.name])
  })

  it("matches a string field by contains", async () => {
    expect(await namesFor("name:vice-007", rows)).toEqual(["service-007"])
  })

  it("matches a glob against the whole value", async () => {
    const expected = rows
      .filter((row) => row.attributes.name.startsWith("service-00"))
      .map((row) => row.attributes.name)
    expect((await namesFor("name:service-00*", rows)).sort()).toEqual(expected.sort())
  })

  it("compares relative dates against the age of the field", async () => {
    const fresh = deployment(1, { created_at: new Date().toISOString() })
    const old = deployment(2, { created_at: new Date(Date.now() - 30 * 86400e3).toISOString() })
    expect(await namesFor("created:<7d", [fresh, old])).toEqual([fresh.attributes.name])
    expect(await namesFor("created:>7d", [fresh, old])).toEqual([old.attributes.name])
  })

  it("filters on attribute presence and absence", async () => {
    const withKey = deployment(1, { attributes: { oncall: "on@example.com" } })
    const withoutKey = deployment(2)
    expect(await namesFor("has:oncall", [withKey, withoutKey])).toEqual([withKey.attributes.name])
    expect(await namesFor("-has:oncall", [withKey, withoutKey])).toEqual([withoutKey.attributes.name])
  })

  it("hides deleted deployments by default and shows only them under the deleted scope", async () => {
    const live = deployment(1)
    const gone = deployment(2, { deleted_at: deletedDaysAgo() })
    expect(await namesFor("", [live, gone])).toEqual([live.attributes.name])
    expect(await namesFor("is:deleted", [live, gone])).toEqual([gone.attributes.name])
  })

  it("orders by a directive in both directions", async () => {
    const ascending = await namesFor("sort:name", rows)
    expect(ascending).toEqual([...ascending].sort())
    expect(await namesFor("sort:-name", rows)).toEqual([...ascending].reverse())
  })

  it("ignores an invalid token instead of narrowing on it", async () => {
    expect((await namesFor("nonsense:1", rows)).sort()).toEqual((await namesFor("", rows)).sort())
  })

  it("hides a deployment whose retention window has run out", async () => {
    const kept = deployment(1, { deleted_at: new Date(Date.now() - 5 * 86400e3).toISOString() })
    const expired = deployment(2, { deleted_at: new Date(Date.now() - 31 * 86400e3).toISOString() })

    expect(await namesFor("is:deleted", [kept, expired])).toEqual([kept.attributes.name])
    expect(await namesFor("", [kept, expired])).toEqual([])
  })

  it("treats a negated deleted scope as the default scope", async () => {
    const live = deployment(1)
    const gone = deployment(2, { deleted_at: deletedDaysAgo() })

    expect(await namesFor("-is:deleted", [live, gone])).toEqual([live.attributes.name])
  })
})
