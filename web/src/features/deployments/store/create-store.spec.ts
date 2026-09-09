import { afterEach, describe, expect, it, vi } from "vitest"
import { deletedDaysAgo, deployment, deployments } from "@/test/deployments"
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
  await store.collection.preload()
  await holds(store, rows.length)
  return { api, store }
}

const holds = (current: DeploymentsStore, count: number) =>
  vi.waitFor(() => expect(current.collection.size).toBe(count))

const idsIn = (current: DeploymentsStore) => [...current.collection.values()].map((row) => row.deployment_id).toSorted()

const rowIn = (current: DeploymentsStore, id: string) =>
  [...current.collection.values()].find((row) => row.deployment_id === id)

const settle = async (current: DeploymentsStore) => {
  await vi.waitFor(() => expect(current.sync.snapshot().pendingIds.size).toBe(0))
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 20)
  })
}

afterEach(async () => {
  await store?.destroy()
  store = null
})

describe("createDeploymentsStore", () => {
  it("pulls every deployment into the collection on first load", async () => {
    const rows = deployments(3)

    const { store: current } = await storeOver(rows)

    expect(idsIn(current)).toEqual(rows.map((row) => row.deployment_id).toSorted())
  })

  it("walks the checkpoint pages until the dataset is exhausted", async () => {
    const rows = deployments(5)

    const { api, store: current } = await storeOver(rows, 2)

    expect(idsIn(current)).toEqual(rows.map((row) => row.deployment_id).toSorted())
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
    await first.collection.preload()
    await holds(first, rows.length)
    await first.destroy()
    const requestsAfterFirstRun = api.requests.length

    store = await createDeploymentsStore({ api, databaseName, multiInstance: false })
    await store.collection.preload()
    await holds(store, rows.length)

    const resumed = api.requests.slice(requestsAfterFirstRun)
    expect(resumed[0].after).toEqual({
      updated_at: rows[2].updated_at,
      deployment_id: rows[2].deployment_id,
    })
    expect(idsIn(store)).toEqual(rows.map((row) => row.deployment_id).toSorted())
  })

  it("keeps deleted deployments in the collection without marking them deleted in storage", async () => {
    const rows = deployments(2)
    const gone = { ...rows[1], deleted_at: deletedDaysAgo() }

    const { store: current } = await storeOver([rows[0], gone])

    const stored = [...current.collection.values()]
    expect(stored).toHaveLength(2)
    expect(stored.find((row) => row.deployment_id === gone.deployment_id)?.deleted_at).toBe(gone.deleted_at)
    expect(stored.every((row) => !("_deleted" in row && row._deleted))).toBe(true)
  })

  it("pushes a local edit to the API with the revision it expects to replace", async () => {
    const rows = deployments(2)
    const { api, store: current } = await storeOver(rows)

    current.collection.update(rows[0].deployment_id, (draft) => {
      draft.attributes.name = "renamed"
    })
    await settle(current)

    expect(api.writes).toHaveLength(1)
    expect(api.writes[0]).toMatchObject({ id: rows[0].deployment_id, expectedRevision: 1 })
    expect(api.rowFor(rows[0].deployment_id)?.attributes.name).toBe("renamed")
  })

  it("takes the revision the server stamped back into the collection", async () => {
    const rows = deployments(1)
    const { store: current } = await storeOver(rows)

    current.collection.update(rows[0].deployment_id, (draft) => {
      draft.attributes.name = "renamed"
    })
    await settle(current)

    expect(rowIn(current, rows[0].deployment_id)?.revision).toBe(2)
  })

  it("reverts to the winning document when someone else wrote first", async () => {
    const rows = deployments(1)
    const { api, store: current } = await storeOver(rows)
    api.store({ ...rows[0], attributes: { ...rows[0].attributes, name: "theirs" }, revision: 7 })

    current.collection.update(rows[0].deployment_id, (draft) => {
      draft.attributes.name = "mine"
    })
    await settle(current)

    expect(rowIn(current, rows[0].deployment_id)?.attributes.name).toBe("theirs")
  })

  it("exposes the losing field so the view can explain the revert", async () => {
    const rows = deployments(1)
    const { api, store: current } = await storeOver(rows)
    api.store({ ...rows[0], attributes: { ...rows[0].attributes, name: "theirs" }, revision: 7 })

    current.collection.update(rows[0].deployment_id, (draft) => {
      draft.attributes.name = "mine"
    })
    await settle(current)

    expect(current.sync.snapshot().conflict?.differences).toEqual([
      { key: "name", attempted: "mine", winning: "theirs" },
    ])
  })

  it("leaves nothing pending once a write settles", async () => {
    const rows = deployments(1)
    const { store: current } = await storeOver(rows)

    current.collection.update(rows[0].deployment_id, (draft) => {
      draft.attributes.name = "renamed"
    })
    await settle(current)

    expect([...current.sync.snapshot().pendingIds]).toEqual([])
  })

  it("applies a change that arrives on the stream", async () => {
    const rows = deployments(2)
    const { api, store: current } = await storeOver(rows)

    api.emit([{ ...rows[0], attributes: { ...rows[0].attributes, name: "from-elsewhere" }, revision: 4 }])
    await settle(current)

    expect(rowIn(current, rows[0].deployment_id)?.attributes.name).toBe("from-elsewhere")
    expect(rowIn(current, rows[0].deployment_id)?.revision).toBe(4)
  })

  it("takes a deployment nobody has seen before off the stream", async () => {
    const rows = deployments(2)
    const { api, store: current } = await storeOver(rows)
    const arrival = deployment(50)

    api.emit([arrival])
    await settle(current)

    expect(idsIn(current)).toContain(arrival.deployment_id)
  })

  it("catches up from its checkpoint after the connection drops", async () => {
    const rows = deployments(2)
    const { api, store: current } = await storeOver(rows)
    const missed = deployment(60)
    api.store(missed)
    const requestsBeforeDrop = api.requests.length

    api.drop()
    await settle(current)

    expect(api.requests.length).toBeGreaterThan(requestsBeforeDrop)
    expect(idsIn(current)).toContain(missed.deployment_id)
  })

  it("reports the connection state the footer shows", async () => {
    const { api, store: current } = await storeOver(deployments(1))

    api.connect()
    expect(current.sync.snapshot().connection).toBe("live")

    api.drop()
    expect(current.sync.snapshot().connection).toBe("reconnecting")
  })

  it("leaves the collection unchanged when a write comes back on the stream", async () => {
    const rows = deployments(2)
    const { api, store: current } = await storeOver(rows)
    current.collection.update(rows[0].deployment_id, (draft) => {
      draft.attributes.name = "mine"
    })
    await settle(current)
    const afterWrite = rowIn(current, rows[0].deployment_id)

    api.emit([api.rowFor(rows[0].deployment_id) as Deployment])
    await settle(current)

    expect(rowIn(current, rows[0].deployment_id)).toEqual(afterWrite)
    expect(api.writes).toHaveLength(1)
  })

  it("refuses a value the schema forbids before it reaches the store", async () => {
    const rows = deployments(1)
    const { api, store: current } = await storeOver(rows)

    expect(() =>
      current.collection.update(rows[0].deployment_id, (draft) => {
        draft.attributes.oncall = "not-an-email"
      }),
    ).toThrow(/email/u)
    expect(api.writes).toHaveLength(0)
  })

  it("reverts and explains a write the API refuses", async () => {
    const rows = deployments(1)
    const { api, store: current } = await storeOver(rows)
    api.refuseWrites("attributes oncall must be an email address")

    current.collection.update(rows[0].deployment_id, (draft) => {
      draft.attributes.name = "renamed"
    })
    await settle(current)

    expect(rowIn(current, rows[0].deployment_id)?.attributes.name).toBe(rows[0].attributes.name)
    expect(current.sync.snapshot().rejection?.detail).toContain("must be an email address")
    expect(current.sync.snapshot().conflict).toBeNull()
  })

  it("sends a newly deleted row to the delete endpoint", async () => {
    const rows = deployments(2)
    const { api, store: current } = await storeOver(rows)

    current.collection.update(rows[0].deployment_id, (draft) => {
      draft.deleted_at = new Date().toISOString()
    })
    await settle(current)

    expect(api.rowFor(rows[0].deployment_id)?.deleted_at).not.toBeNull()
    expect(api.writes).toHaveLength(0)
  })

  it("sends a row whose deletion was undone to the restore endpoint", async () => {
    const rows = deployments(2)
    const gone = { ...rows[1], deleted_at: deletedDaysAgo() }
    const { api, store: current } = await storeOver([rows[0], gone])

    current.collection.update(gone.deployment_id, (draft) => {
      draft.deleted_at = null
    })
    await settle(current)

    expect(api.rowFor(gone.deployment_id)?.deleted_at).toBeNull()
  })

  it("takes a deletion that arrives on the stream", async () => {
    const rows = deployments(2)
    const { api, store: current } = await storeOver(rows)

    api.emit([{ ...rows[0], deleted_at: deletedDaysAgo(), revision: 5 }])
    await settle(current)

    expect(rowIn(current, rows[0].deployment_id)?.deleted_at).not.toBeNull()
  })

  it("takes a restore that arrives on the stream", async () => {
    const rows = deployments(2)
    const gone = { ...rows[1], deleted_at: deletedDaysAgo() }
    const { api, store: current } = await storeOver([rows[0], gone])

    api.emit([{ ...gone, deleted_at: null, revision: 6 }])
    await settle(current)

    expect(rowIn(current, gone.deployment_id)?.deleted_at).toBeNull()
  })
})
