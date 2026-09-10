import { createCollection, createLiveQueryCollection, localOnlyCollectionOptions } from "@tanstack/react-db"
import { describe, expect, it } from "vitest"
import { deletedDaysAgo, deployment, deployments } from "@/test/deployments"
import type { Deployment } from "../store/schema"
import { compileQuery } from "./compile"
import { parseQuery } from "./filter-set"
import { buildSchema } from "./schema"
import { DEFAULT_SORT, type Sorting } from "./sort"

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

const namesFor = async (query: string, rows: Deployment[], sort: Sorting = DEFAULT_SORT) => {
  const schema = buildSchema(rows)
  const collection = collectionOver(rows)
  const live = createLiveQueryCollection((builder) =>
    compileQuery(builder.from({ deployment: collection }), parseQuery(query, schema), sort, schema).select(
      ({ deployment: row }) => ({ name: row.attributes.name }),
    ),
  )
  await live.preload()
  const names = [...live.values()].map((row) => row.name)
  await live.cleanup()
  await collection.cleanup()
  return names
}

const rows = deployments(12)

describe("compileQuery", () => {
  it("returns every live deployment for an empty query, newest first", async () => {
    expect(await namesFor("", rows)).toEqual(rows.toReversed().map((row) => row.attributes.name))
  })

  it("matches a facet exactly", async () => {
    const failed = rows.filter((row) => row.status === "failed").map((row) => row.attributes.name)
    expect((await namesFor("status:failed", rows)).toSorted()).toEqual(failed.toSorted())
  })

  it("unions the branches of a disjunction", async () => {
    const either = rows
      .filter((row) => row.status === "failed" || row.status === "stopped")
      .map((row) => row.attributes.name)

    expect((await namesFor("status:failed OR status:stopped", rows)).toSorted()).toEqual(either.toSorted())
  })

  it("resolves a facet alias", async () => {
    expect((await namesFor("env:prod", rows)).toSorted()).toEqual((await namesFor("env:production", rows)).toSorted())
  })

  it("intersects separate tokens", async () => {
    const both = rows
      .filter((row) => row.status === "failed" && row.type === "worker")
      .map((row) => row.attributes.name)
    expect((await namesFor("status:failed type:worker", rows)).toSorted()).toEqual(both.toSorted())
  })

  it("excludes a negated token", async () => {
    const rest = rows.filter((row) => row.status !== "failed").map((row) => row.attributes.name)
    expect((await namesFor("-status:failed", rows)).toSorted()).toEqual(rest.toSorted())
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
    expect((await namesFor("name:service-00*", rows)).toSorted()).toEqual(expected.toSorted())
  })

  it("compares UTC calendar days with exclusive day boundaries", async () => {
    const before = deployment(1, { created_at: "2026-09-09T23:59:59.000Z" })
    const on = deployment(2, { created_at: "2026-09-10T12:00:00.000Z" })
    const after = deployment(3, { created_at: "2026-09-11T00:00:00.000Z" })
    const dated = [before, on, after]
    expect(await namesFor("created:<2026-09-10", dated)).toEqual([before.attributes.name])
    expect(await namesFor("created:2026-09-10", dated)).toEqual([on.attributes.name])
    expect(await namesFor("created:>2026-09-10", dated)).toEqual([after.attributes.name])
  })

  it("unions two calendar days and negates the union", async () => {
    const first = deployment(1, { created_at: "2026-09-09T12:00:00.000Z" })
    const second = deployment(2, { created_at: "2026-09-10T12:00:00.000Z" })
    const third = deployment(3, { created_at: "2026-09-11T12:00:00.000Z" })
    const days = [first, second, third]
    const either = "created:2026-09-09 OR created:2026-09-11"

    expect(await namesFor(either, days)).toEqual([third.attributes.name, first.attributes.name])
    expect(await namesFor(`NOT (${either})`, days)).toEqual([second.attributes.name])
  })

  it("hides deleted deployments by default and shows only them under the deleted scope", async () => {
    const live = deployment(1)
    const gone = deployment(2, { deleted_at: deletedDaysAgo() })
    expect(await namesFor("", [live, gone])).toEqual([live.attributes.name])
    expect(await namesFor("is:deleted", [live, gone])).toEqual([gone.attributes.name])
  })

  it("orders by explicit sort state in both directions", async () => {
    const ascending = await namesFor("", rows, { key: "name", desc: false })
    expect(ascending).toEqual(ascending.toSorted())
    expect(await namesFor("", rows, { key: "name", desc: true })).toEqual(ascending.toReversed())
  })

  it("ignores an invalid token instead of narrowing on it", async () => {
    expect((await namesFor("nonsense:1", rows)).toSorted()).toEqual((await namesFor("", rows)).toSorted())
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
