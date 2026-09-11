import { describe, expect, it } from "vitest"
import { deployments } from "@/test/deployments"
import { PULL_BATCH_SIZE } from "./api"
import type { DeploymentsApi } from "./api"
import { purgedDocuments } from "./reconcile"
import type { Deployment } from "./schema"
import type { RxCollection } from "./rxdb"

const collectionHolding = (rows: Deployment[]) =>
  ({
    find: () => ({
      exec: () => Promise.resolve(rows.map((row) => ({ primary: row.deployment_id, toJSON: () => row }))),
    }),
  }) as unknown as RxCollection<Deployment>

const apiMissing = (missing: Set<string>) => {
  const batches: number[] = []
  const api = {
    missingIds: (ids: string[]) => {
      batches.push(ids.length)
      return Promise.resolve(ids.filter((id) => missing.has(id)))
    },
  } as unknown as DeploymentsApi
  return { api, batches }
}

describe("purgedDocuments", () => {
  it("tombstones only the rows the server no longer holds", async () => {
    const rows = deployments(3)
    const gone = rows[1]
    const { api } = apiMissing(new Set([gone.deployment_id]))

    const reconciled = await purgedDocuments(collectionHolding(rows), api)

    expect(reconciled.examined).toBe(3)
    expect(reconciled.missing.map((row) => row.deployment_id)).toEqual([gone.deployment_id])
    expect(reconciled.missing[0]._deleted).toBe(true)
  })

  it("reports nothing when the server still holds every cached row", async () => {
    const rows = deployments(3)
    const { api } = apiMissing(new Set())

    expect(await purgedDocuments(collectionHolding(rows), api)).toEqual({ examined: 3, missing: [] })
  })

  it("asks in batches the reconcile endpoint will accept", async () => {
    const rows = deployments(PULL_BATCH_SIZE + 1)
    const { api, batches } = apiMissing(new Set())

    await purgedDocuments(collectionHolding(rows), api)

    expect(batches).toEqual([PULL_BATCH_SIZE, 1])
  })
})
