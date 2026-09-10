import { describe, expect, it } from "vitest"
import { deployment } from "@/test/deployments"
import { createFakeDeploymentsApi } from "./fake-api"
import { pushRow } from "./replication-writes"
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
