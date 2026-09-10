import { createCollection, createLiveQueryCollection, localOnlyCollectionOptions } from "@tanstack/react-db"
import { describe, expect, it } from "vitest"
import { deletedDaysAgo, deployment, deployments } from "@/test/deployments"
import type { Deployment } from "../store/schema"
import { compileValueIndex } from "./compile"
import { parseQuery } from "./parse-query"
import { buildSchema } from "./schema"
import { resolveKey, type FieldCatalog } from "./fields"
import { withoutFieldFilter } from "./filters"
import { topValues, valueIndexOf, type ValueIndex } from "./value-index"

const rowsFor = (index: ValueIndex, value: string) => index.values.find((entry) => entry.value === value)?.rows

const collectionOver = (rows: Deployment[]) =>
  createCollection(
    localOnlyCollectionOptions<Deployment>({
      id: `index-${crypto.randomUUID()}`,
      getKey: (row: Deployment) => row.deployment_id,
      initialData: rows,
    }),
  )

const fieldFor = (catalog: FieldCatalog, key: string) => {
  const field = resolveKey(catalog, key)
  if (!field) throw new Error(`no field ${key}`)
  return field
}

const indexFor = async (key: string, query: string, rows: Deployment[]) => {
  const { catalog } = buildSchema(rows)
  const field = fieldFor(catalog, key)
  const filters = withoutFieldFilter(parseQuery(query, catalog).plan, field)
  const collection = collectionOver(rows)
  const live = createLiveQueryCollection((builder) =>
    compileValueIndex(builder.from({ deployment: collection }), field, filters, catalog),
  )
  await live.preload()
  return { index: valueIndexOf([...live.values()]), collection, live }
}

const rows = deployments(12)

describe("valueIndexOf", () => {
  it("ranks values by row count and drops the group of rows without a value", () => {
    const index = valueIndexOf([{ value: "checkout", rows: 2 }, { rows: 5 }, { value: "payments", rows: 7 }])

    expect(index.values).toEqual([
      { value: "payments", rows: 7 },
      { value: "checkout", rows: 2 },
    ])
    expect(index.covered).toBe(9)
    expect(rowsFor(index, "payments")).toBe(7)
  })

  it("orders values of equal count alphabetically", () => {
    const index = valueIndexOf([
      { value: "search", rows: 3 },
      { value: "identity", rows: 3 },
    ])

    expect(index.values.map((entry) => entry.value)).toEqual(["identity", "search"])
  })
})

describe("withoutFieldFilter", () => {
  it("drops the tokens that target the indexed field and keeps the rest", () => {
    const { catalog } = buildSchema(rows)
    const filters = parseQuery("status:failed team:payments env:prod", catalog)

    const kept = withoutFieldFilter(filters.plan, fieldFor(catalog, "status"))

    expect(kept.filters).toMatchObject([{ field: { key: "team" } }, { field: { key: "env" } }])
  })

  it("drops a token written with an alias of the indexed field", () => {
    const { catalog } = buildSchema(rows)
    const filters = parseQuery("environment:prod status:failed", catalog)

    const kept = withoutFieldFilter(filters.plan, fieldFor(catalog, "env"))

    expect(kept.filters).toMatchObject([{ field: { key: "status" } }])
  })

  it("keeps the deleted scope when removing a field filter", () => {
    const { catalog } = buildSchema(rows)
    const filters = parseQuery("team:payments is:deleted", catalog)

    const kept = withoutFieldFilter(filters.plan, fieldFor(catalog, "team"))

    expect(kept.filters).toEqual([])
    expect(kept.scope).toBe("deleted")
  })
})

describe("topValues", () => {
  const index: ValueIndex = valueIndexOf([
    { value: "payments", rows: 7 },
    { value: "checkout", rows: 5 },
    { value: "platform", rows: 3 },
  ])

  it("keeps the values that contain the partial, ranked", () => {
    expect(topValues(index, "a", 10).map((entry) => entry.value)).toEqual(["payments", "platform"])
  })

  it("caps the number of values returned", () => {
    expect(topValues(index, "", 2)).toHaveLength(2)
  })
})

describe("compileValueIndex", () => {
  it("counts the rows behind every value of a facet", async () => {
    const { index } = await indexFor("status", "", rows)

    expect(rowsFor(index, "failed")).toBe(rows.filter((row) => row.status === "failed").length)
    expect(index.covered).toBe(rows.length)
  })

  it("counts only the rows the other tokens leave", async () => {
    const { index } = await indexFor("status", "type:worker", rows)

    const workers = rows.filter((row) => row.type === "worker")
    expect(index.covered).toBe(workers.length)
    expect(rowsFor(index, "failed")).toBe(workers.filter((row) => row.status === "failed").length)
  })

  it("reports attribute coverage without counting the rows that lack the key", async () => {
    const tagged = deployment(1, { attributes: { oncall: "on@example.com" } })
    const untagged = deployment(2, { attributes: { oncall: undefined } })

    const { index } = await indexFor("oncall", "", [tagged, untagged])

    expect(index.covered).toBe(1)
    expect(index.values).toEqual([{ value: "on@example.com", rows: 1 }])
  })

  it("counts inside the deleted scope when the query asks for it", async () => {
    const live = deployment(1, { attributes: { team: "payments" } })
    const gone = deployment(2, { attributes: { team: "search" }, deleted_at: deletedDaysAgo() })

    const { index } = await indexFor("team", "is:deleted", [live, gone])

    expect(index.values).toEqual([{ value: "search", rows: 1 }])
  })

  it("takes a new value into the index when a row arrives", async () => {
    const { index, collection, live } = await indexFor("team", "", rows)
    expect(rowsFor(index, "brand-new") !== undefined).toBe(false)

    collection.insert(deployment(500, { attributes: { team: "brand-new" } }))
    await Promise.resolve()

    expect(rowsFor(valueIndexOf([...live.values()]), "brand-new")).toBe(1)
  })
})
