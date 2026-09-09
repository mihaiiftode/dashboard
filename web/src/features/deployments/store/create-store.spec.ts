import { afterEach, describe, expect, it } from "vitest"
import { deployments } from "@/test/deployments"
import { createFakeDeploymentsApi } from "./fake-api"
import { createDeploymentsStore, type DeploymentsStore } from "./create-store"
import type { Deployment } from "./schema"

let store: DeploymentsStore | null = null

const storeOver = async (rows: Deployment[], pullBatchSize?: number) => {
  const api = createFakeDeploymentsApi(rows)
  store = await createDeploymentsStore({
    api,
    databaseName: `store-${crypto.randomUUID()}`,
    multiInstance: false,
    pullBatchSize,
  })
  await store.whenFirstPullSettles()
  await store.whenInSync()
  await store.collection.preload()
  return { api, store }
}

const idsIn = (current: DeploymentsStore) => [...current.collection.values()].map((row) => row.deployment_id).sort()

afterEach(async () => {
  await store?.destroy()
  store = null
})

describe("createDeploymentsStore", () => {
  it("pulls every deployment into the collection on first load", async () => {
    const rows = deployments(3)

    const { store: current } = await storeOver(rows)

    expect(idsIn(current)).toEqual(rows.map((row) => row.deployment_id).sort())
  })

  it("walks the checkpoint pages until the dataset is exhausted", async () => {
    const rows = deployments(5)

    const { api, store: current } = await storeOver(rows, 2)

    expect(idsIn(current)).toEqual(rows.map((row) => row.deployment_id).sort())
    expect(api.requests.map((request) => request.after?.deployment_id ?? null)).toEqual([
      null,
      rows[1].deployment_id,
      rows[3].deployment_id,
    ])
  })

  it("resumes from the stored checkpoint instead of pulling everything again", async () => {
    const rows = deployments(3)
    const databaseName = `store-${crypto.randomUUID()}`
    const api = createFakeDeploymentsApi(rows)

    const first = await createDeploymentsStore({ api, databaseName, multiInstance: false })
    await first.whenFirstPullSettles()
    await first.whenInSync()
    await first.destroy()
    const requestsAfterFirstRun = api.requests.length

    store = await createDeploymentsStore({ api, databaseName, multiInstance: false })
    await store.whenFirstPullSettles()
    await store.whenInSync()
    await store.collection.preload()

    const resumed = api.requests.slice(requestsAfterFirstRun)
    expect(resumed[0].after).toEqual({
      updated_at: rows[2].updated_at,
      deployment_id: rows[2].deployment_id,
    })
    expect(idsIn(store)).toEqual(rows.map((row) => row.deployment_id).sort())
  })

  it("keeps deleted deployments in the collection without marking them deleted in storage", async () => {
    const rows = deployments(2)
    const gone = { ...rows[1], deleted_at: "2026-03-02T09:00:00.000Z" }

    const { store: current } = await storeOver([rows[0], gone])

    const stored = [...current.collection.values()]
    expect(stored).toHaveLength(2)
    expect(stored.find((row) => row.deployment_id === gone.deployment_id)?.deleted_at).toBe(gone.deleted_at)
    expect(stored.every((row) => !("_deleted" in row && row._deleted))).toBe(true)
  })
})
