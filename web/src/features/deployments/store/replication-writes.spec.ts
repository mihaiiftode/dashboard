import { describe, expect, it } from "vitest"
import { deletedDaysAgo, deployment } from "@/test/deployments"
import { must } from "@/test/must"
import { createFakeDeploymentsApi } from "./fake-api"
import { pushRow } from "./replication-writes"
import type { Deployment } from "./schema"
import { createSyncTracker } from "./sync-tracker"

describe("write settlement", () => {
  it("keeps a failed network attempt pending for retry", async () => {
    const master = deployment(1)
    const api = createFakeDeploymentsApi([master])
    api.failWrites(503, "retry")
    const tracker = createSyncTracker()
    const attempted = { ...master, attributes: { ...master.attributes, name: "edited" } }
    await expect(
      pushRow(
        { newDocumentState: { ...attempted, _deleted: false }, assumedMasterState: { ...master, _deleted: false } },
        api,
        tracker,
      ),
    ).rejects.toThrow(/retry/u)
    expect(tracker.snapshot().pendingIds.has(master.deployment_id)).toBe(true)
    expect(tracker.snapshot().rejection).toBeNull()
  })

  it("settles a delete the server already applied under its own stamp", async () => {
    const master = deployment(1)
    const api = createFakeDeploymentsApi([master])
    const tracker = createSyncTracker()
    const acknowledged = new Map<string, Deployment>()
    const row = {
      newDocumentState: { ...master, deleted_at: "2026-03-02T09:00:00.000Z", _deleted: false },
      assumedMasterState: { ...master, _deleted: false },
    }

    await pushRow(row, api, tracker, acknowledged)
    await pushRow(row, api, tracker, acknowledged)

    expect(tracker.snapshot().rejection).toBeNull()
    expect(must(api.rowFor(master.deployment_id), "the stored row").deleted_at).not.toBeNull()
  })

  it("settles a restore another replication instance already applied", async () => {
    const master = deployment(1, { deleted_at: deletedDaysAgo(1) })
    const api = createFakeDeploymentsApi([master])
    const tracker = createSyncTracker()
    const row = {
      newDocumentState: { ...master, deleted_at: null, _deleted: false },
      assumedMasterState: { ...master, _deleted: false },
    }

    await pushRow(row, api, tracker)
    await pushRow(row, api, tracker)

    expect(tracker.snapshot().rejection).toBeNull()
    expect(must(api.rowFor(master.deployment_id), "the stored row").deleted_at).toBeNull()
  })

  it("settles a purged server document as a tombstone and reports the lost edit", async () => {
    const master = deployment(1)
    const api = createFakeDeploymentsApi([])
    const tracker = createSyncTracker()
    const attempted = { ...master, attributes: { ...master.attributes, name: "edited" } }
    const result = await pushRow(
      { newDocumentState: { ...attempted, _deleted: false }, assumedMasterState: { ...master, _deleted: false } },
      api,
      tracker,
    )
    expect(result?._deleted).toBe(true)
    expect(tracker.snapshot().rejection?.deployment.deployment_id).toBe(master.deployment_id)
    expect(tracker.snapshot().pendingIds.size).toBe(0)
  })
})
