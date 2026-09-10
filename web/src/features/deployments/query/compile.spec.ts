import { createCollection, createLiveQueryCollection, localOnlyCollectionOptions } from "@tanstack/react-db"
import { afterEach, describe, expect, it, vi } from "vitest"
import { deletedDaysAgo, deployment, deployments } from "@/test/deployments"
import type { Deployment } from "../store/schema"
import { compileQuery, compileScopeCounts } from "./compile"
import { parseQuery } from "./parse-query"
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
  const { catalog } = buildSchema(rows)
  const collection = collectionOver(rows)
  const live = createLiveQueryCollection((builder) =>
    compileQuery(builder.from({ deployment: collection }), parseQuery(query, catalog).plan, sort, catalog).select(
      ({ deployment: row }) => ({ name: row.attributes.name }),
    ),
  )
  await live.preload()
  const names = [...live.values()].map((row) => row.name)
  await live.cleanup()
  await collection.cleanup()
  return names
}

const scopeCountsFor = async (rows: Deployment[]) => {
  const collection = collectionOver(rows)
  const live = createLiveQueryCollection((builder) => compileScopeCounts(builder.from({ deployment: collection })))
  await live.preload()
  const counts = { live: 0, deleted: 0 }
  for (const group of live.values()) {
    if (group.live) counts.live += group.rows
    else counts.deleted += group.rows
  }
  await live.cleanup()
  await collection.cleanup()
  return counts
}

afterEach(() => vi.useRealTimers())

const rows = deployments(12)
const firstDay = deployment(1, { created_at: "2026-09-09T12:00:00.000000Z" })
const secondDay = deployment(2, { created_at: "2026-09-10T12:00:00.000000Z" })
const twoDays = [firstDay, secondDay]

describe("compileQuery", () => {
  it("returns every live deployment for an empty query, newest first", async () => {
    expect(await namesFor("", rows)).toEqual(rows.toReversed().map((row) => row.attributes.name))
  })

  it("matches a facet exactly", async () => {
    const failed = rows.filter((row) => row.status === "failed").map((row) => row.attributes.name)
    expect((await namesFor("status:failed", rows)).toSorted()).toEqual(failed.toSorted())
  })

  it("resolves a facet alias", async () => {
    expect((await namesFor("env:prod", rows)).toSorted()).toEqual((await namesFor("env:production", rows)).toSorted())
  })

  it("intersects separate tokens", async () => {
    const both = rows
      .filter((row) => row.status === "failed")
      .filter((row) => row.type === "worker")
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
    const after = deployment(3, { created_at: "2026-09-11T00:00:00.000000Z" })
    const dated = [before, on, after]
    expect(await namesFor("created:<2026-09-10", dated)).toEqual([before.attributes.name])
    expect(await namesFor("created:2026-09-10", dated)).toEqual([on.attributes.name])
    expect(await namesFor("created:>2026-09-10", dated)).toEqual([after.attributes.name])
  })

  it("compares offset timestamps by instant across the UTC midnight boundary", async () => {
    const before = deployment(1, { created_at: "2026-09-10T01:59:59.999999+02:00" })
    const midnight = deployment(2, { created_at: "2026-09-09T19:00:00-05:00" })
    const sameMidnight = deployment(3, { created_at: "2026-09-10T00:00:00Z" })

    expect(await namesFor("created:2026-09-09", [before, midnight, sameMidnight])).toEqual([before.attributes.name])
    expect((await namesFor("created:2026-09-10", [before, midnight, sameMidnight])).toSorted()).toEqual(
      [midnight.attributes.name, sameMidnight.attributes.name].toSorted(),
    )
  })

  it("matches an exact value whatever case it was typed or stored in", async () => {
    const mixed = deployment(1, { attributes: { name: "Payments" } })

    expect(await namesFor("name:=Payments", [mixed])).toEqual(["Payments"])
    expect(await namesFor("name:=payments", [mixed])).toEqual(["Payments"])
  })

  it("narrows by nothing when a relational comparator is used on a non-date field", async () => {
    expect((await namesFor("status:>failed", rows)).toSorted()).toEqual((await namesFor("", rows)).toSorted())
  })

  it("matches a calendar day", async () => {
    expect(await namesFor("created:2026-09-09", twoDays)).toEqual([firstDay.attributes.name])
  })

  it("negates a calendar day", async () => {
    expect(await namesFor("NOT created:2026-09-09", twoDays)).toEqual([secondDay.attributes.name])
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

  it("expires equivalent retention instants regardless of offset or fractional precision", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-09-10T12:00:00.000Z"))
    const boundary = deployment(1, { deleted_at: "2026-08-11T14:00:00+02:00" })
    const afterBoundary = deployment(2, { deleted_at: "2026-08-11T12:00:00.001000Z" })

    expect(await namesFor("is:deleted", [boundary, afterBoundary])).toEqual([afterBoundary.attributes.name])
  })

  it("treats a negated deleted scope as the default scope", async () => {
    const live = deployment(1)
    const gone = deployment(2, { deleted_at: deletedDaysAgo() })

    expect(await namesFor("-is:deleted", [live, gone])).toEqual([live.attributes.name])
  })
})

describe("compileScopeCounts", () => {
  it("counts only the deleted rows the deleted scope will list", async () => {
    const alive = deployment(1)
    const kept = deployment(2, { deleted_at: deletedDaysAgo(5) })
    const expired = deployment(3, { deleted_at: deletedDaysAgo(31) })

    expect(await scopeCountsFor([alive, kept, expired])).toEqual({ live: 1, deleted: 1 })
  })
})
