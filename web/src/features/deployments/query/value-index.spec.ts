import { createCollection, createLiveQueryCollection, localOnlyCollectionOptions } from "@tanstack/react-db"
import { describe, expect, it } from "vitest"
import { deployment, deployments } from "@/test/deployments"
import type { Deployment } from "../store/schema"
import { resolve } from "./apply"
import { compileValueIndex } from "./compile"
import { parse } from "./grammar"
import { buildSchema, resolveKey, type Schema } from "./schema"
import { contextFilters, topValues, valueIndexOf, type ValueIndex } from "./value-index"

const collectionOver = (rows: Deployment[]) =>
  createCollection(
    localOnlyCollectionOptions<Deployment>({
      id: `index-${crypto.randomUUID()}`,
      getKey: (row: Deployment) => row.deployment_id,
      initialData: rows,
    }),
  )

const fieldFor = (schema: Schema, key: string) => {
  const field = resolveKey(schema, key)
  if (!field) throw new Error(`no field ${key}`)
  return field
}

const indexFor = async (key: string, query: string, rows: Deployment[]) => {
  const schema = buildSchema(rows)
  const field = fieldFor(schema, key)
  const filters = contextFilters(resolve(parse(query), schema).filters, field, schema)
  const collection = collectionOver(rows)
  const live = createLiveQueryCollection((builder) =>
    compileValueIndex(builder.from({ deployment: collection }), field, filters, schema),
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
    expect(index.byValue.get("payments")).toBe(7)
  })

  it("orders values of equal count alphabetically", () => {
    const index = valueIndexOf([
      { value: "search", rows: 3 },
      { value: "identity", rows: 3 },
    ])

    expect(index.values.map((entry) => entry.value)).toEqual(["identity", "search"])
  })
})

describe("contextFilters", () => {
  it("drops the tokens that target the indexed field and keeps the rest", () => {
    const schema = buildSchema(rows)
    const filters = resolve(parse("status:failed team:payments env:prod"), schema).filters

    const kept = contextFilters(filters, fieldFor(schema, "status"), schema)

    expect(kept.map((token) => token.raw)).toEqual(["team:payments", "env:prod"])
  })

  it("drops a token written with an alias of the indexed field", () => {
    const schema = buildSchema(rows)
    const filters = resolve(parse("environment:prod status:failed"), schema).filters

    const kept = contextFilters(filters, fieldFor(schema, "env"), schema)

    expect(kept.map((token) => token.raw)).toEqual(["status:failed"])
  })

  it("drops a presence token on the indexed attribute and keeps the deleted scope", () => {
    const schema = buildSchema(rows)
    const filters = resolve(parse("has:team is:deleted"), schema).filters

    const kept = contextFilters(filters, fieldFor(schema, "team"), schema)

    expect(kept.map((token) => token.raw)).toEqual(["is:deleted"])
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

  it("excludes values already chosen in the token", () => {
    expect(topValues(index, "", 10, ["payments"]).map((entry) => entry.value)).toEqual(["checkout", "platform"])
  })

  it("caps the number of values returned", () => {
    expect(topValues(index, "", 2)).toHaveLength(2)
  })
})

describe("compileValueIndex", () => {
  it("counts the rows behind every value of a facet", async () => {
    const { index } = await indexFor("status", "", rows)

    expect(index.byValue.get("failed")).toBe(rows.filter((row) => row.status === "failed").length)
    expect(index.covered).toBe(rows.length)
  })

  it("counts only the rows the other tokens leave", async () => {
    const { index } = await indexFor("status", "type:worker", rows)

    const workers = rows.filter((row) => row.type === "worker")
    expect(index.covered).toBe(workers.length)
    expect(index.byValue.get("failed")).toBe(workers.filter((row) => row.status === "failed").length)
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
    const gone = deployment(2, { attributes: { team: "search" }, deleted_at: "2026-03-02T09:00:00.000Z" })

    const { index } = await indexFor("team", "is:deleted", [live, gone])

    expect(index.values).toEqual([{ value: "search", rows: 1 }])
  })

  it("takes a new value into the index when a row arrives", async () => {
    const { index, collection, live } = await indexFor("team", "", rows)
    expect(index.byValue.has("brand-new")).toBe(false)

    collection.insert(deployment(500, { attributes: { team: "brand-new" } }))
    await Promise.resolve()

    expect(valueIndexOf([...live.values()]).byValue.get("brand-new")).toBe(1)
  })
})
