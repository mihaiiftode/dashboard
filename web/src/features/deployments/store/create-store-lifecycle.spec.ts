import { describe, expect, it } from "vitest"
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
