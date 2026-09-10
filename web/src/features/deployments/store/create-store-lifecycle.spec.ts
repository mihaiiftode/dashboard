import { describe, expect, it, vi } from "vitest"
import { deployments } from "@/test/deployments"
import { createFakeDeploymentsApi } from "./fake-api"
import { createDeploymentsStore } from "./create-store"

const refuseToSubscribe = (): never => {
  throw new Error("subscribe failed")
}

const apiRefusingTheStream = () => ({ ...createFakeDeploymentsApi([]), subscribe: refuseToSubscribe })

describe("store lifecycle", () => {
  it("releases the database when the event subscription fails, so the name is free to retry", async () => {
    const databaseName = `store-${crypto.randomUUID()}`

    await expect(
      createDeploymentsStore({ api: apiRefusingTheStream(), databaseName, multiInstance: false }),
    ).rejects.toThrow("subscribe failed")

    const retried = await createDeploymentsStore({
      api: createFakeDeploymentsApi(deployments(2)),
      databaseName,
      multiInstance: false,
    })

    await expect(retried.destroy()).resolves.toBeUndefined()
  })

  it("tolerates a repeated destroy", async () => {
    const store = await createDeploymentsStore({
      api: createFakeDeploymentsApi(deployments(2)),
      databaseName: `store-${crypto.randomUUID()}`,
      multiInstance: false,
    })
    await store.collection.preload()

    await store.destroy()

    await expect(store.destroy()).resolves.toBeUndefined()
  })
})

const storeWith = async (api: ReturnType<typeof createFakeDeploymentsApi>) => {
  const store = await createDeploymentsStore({
    api,
    databaseName: `store-${crypto.randomUUID()}`,
    multiInstance: false,
  })
  await store.collection.preload()
  await vi.waitFor(() => expect(store.collection.size).toBe(1))
  return store
}

describe("write failure classification", () => {
  it("reports a validation refusal as a rejection", async () => {
    const rows = deployments(1)
    const api = createFakeDeploymentsApi(rows)
    const store = await storeWith(api)
    api.refuseWrites("attributes oncall must be an email address")

    store.collection.update(rows[0].deployment_id, (draft) => {
      draft.attributes.name = "renamed"
    })

    await vi.waitFor(() => expect(store.sync.snapshot().rejection?.detail).toContain("must be an email address"))
    await store.destroy()
  })

  it.each([408, 429])("does not turn a retryable %i into a permanent rejection", async (status) => {
    const rows = deployments(1)
    const api = createFakeDeploymentsApi(rows)
    const store = await storeWith(api)
    api.failWrites(status, "try again later")

    store.collection.update(rows[0].deployment_id, (draft) => {
      draft.attributes.name = "renamed"
    })

    await vi.waitFor(() => expect(store.sync.snapshot().connection).toBe("reconnecting"))
    expect(store.sync.snapshot().rejection).toBeNull()
    expect(store.sync.snapshot().pendingIds.has(rows[0].deployment_id)).toBe(true)
    await store.destroy()
  })
})
