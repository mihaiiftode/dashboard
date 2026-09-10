import { afterEach, describe, expect, it, vi } from "vitest"
import { deployment, deployments } from "@/test/deployments"
import { createDeploymentsStore, type DeploymentsStore } from "./create-store"
import { createFakeDeploymentsApi } from "./fake-api"

let store: DeploymentsStore | undefined
afterEach(async () => {
  await store?.destroy()
})

const open = async (
  api: ReturnType<typeof createFakeDeploymentsApi>,
  databaseName = `recovery-${crypto.randomUUID()}`,
) => {
  store = await createDeploymentsStore({ api, databaseName, multiInstance: false })
  await store.collection.preload()
  return store
}

describe("replication recovery", () => {
  it("preserves an undo queued while a deletion is in flight", async () => {
    const rows = deployments(1)
    const api = createFakeDeploymentsApi(rows)
    let release!: () => void
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const originalRemove = api.remove
    api.remove = async (id) => {
      await held
      await originalRemove(id)
    }
    const current = await open(api)
    await vi.waitFor(() => expect(current.collection.size).toBe(1))
    current.collection.update(rows[0].deployment_id, (draft) => {
      draft.deleted_at = new Date().toISOString()
    })
    await vi.waitFor(() => expect(current.sync.snapshot().pendingIds.size).toBe(1))
    current.collection.update(rows[0].deployment_id, (draft) => {
      draft.deleted_at = null
    })
    release()
    await vi.waitFor(() => expect(api.rowFor(rows[0].deployment_id)?.revision).toBe(3))
    expect(api.rowFor(rows[0].deployment_id)?.deleted_at).toBeNull()
    await vi.waitFor(() => expect(current.sync.snapshot().pendingIds.size).toBe(0))
    expect(current.sync.snapshot().rejection).toBeNull()
  })
  it("keeps the row pending until the latest of two queued edits reaches the server", async () => {
    const rows = deployments(1)
    const api = createFakeDeploymentsApi(rows)
    const current = await open(api)
    await vi.waitFor(() => expect(current.collection.size).toBe(1))
    const release = api.holdWrites()
    current.collection.update(rows[0].deployment_id, (draft) => {
      draft.attributes.name = "first"
    })
    await vi.waitFor(() => expect(current.sync.snapshot().pendingIds.size).toBe(1))
    current.collection.update(rows[0].deployment_id, (draft) => {
      draft.attributes.name = "second"
    })
    const observed: { pending: boolean; saved: string | undefined }[] = []
    const unsubscribe = current.sync.subscribe(() =>
      observed.push({
        pending: current.sync.snapshot().pendingIds.has(rows[0].deployment_id),
        saved: api.rowFor(rows[0].deployment_id)?.attributes.name,
      }),
    )
    release()
    await vi.waitFor(() => expect(api.rowFor(rows[0].deployment_id)?.attributes.name).toBe("second"))
    await vi.waitFor(() => expect(current.sync.snapshot().pendingIds.size).toBe(0))
    unsubscribe()
    const settled = observed.filter((seen) => !seen.pending)
    expect(settled.map((seen) => seen.saved)).toEqual(settled.map(() => "second"))
  })
  it("pulls writes made after the disconnect pull but before reopen", async () => {
    const rows = deployments(2)
    const api = createFakeDeploymentsApi(rows)
    const current = await open(api)
    await vi.waitFor(() => expect(current.collection.size).toBe(2))
    const requests = api.requests.length
    api.drop()
    await vi.waitFor(() => expect(api.requests.length).toBeGreaterThan(requests))
    const missed = deployment(80)
    api.store(missed)
    api.connect()
    await vi.waitFor(() =>
      expect(current.collection.get(missed.deployment_id)?.attributes.name).toBe(missed.attributes.name),
    )
  })

  it("does not skip an unstreamed write when a later stream event arrives", async () => {
    const rows = deployments(2)
    const api = createFakeDeploymentsApi(rows)
    const current = await open(api)
    await vi.waitFor(() => expect(current.collection.size).toBe(2))
    const missed = deployment(80)
    const later = deployment(90)
    api.store(missed)
    api.emit([later])
    await vi.waitFor(() => expect(current.collection.get(later.deployment_id)).toBeDefined())
    expect(current.collection.get(missed.deployment_id)?.attributes.name).toBe(missed.attributes.name)
  })

  it("removes a cached active row purged while the browser was closed", async () => {
    const rows = deployments(2)
    const api = createFakeDeploymentsApi(rows)
    const databaseName = `recovery-${crypto.randomUUID()}`
    const first = await open(api, databaseName)
    await vi.waitFor(() => expect(first.collection.size).toBe(2))
    await first.destroy()
    api.replaceAll([rows[1]])
    const reopened = await open(api, databaseName)
    await vi.waitFor(() => expect(reopened.collection.size).toBe(1))
    expect(reopened.collection.get(rows[0].deployment_id)).toBeUndefined()
  })
})
