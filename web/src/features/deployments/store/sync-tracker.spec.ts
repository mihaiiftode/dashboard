import { describe, expect, it } from "vitest"
import { deployment } from "@/test/deployments"
import { createSyncTracker } from "./sync-tracker"

const pending = (tracker: ReturnType<typeof createSyncTracker>) => [...tracker.snapshot().pendingIds]

describe("createSyncTracker", () => {
  it("holds a row pending from the moment its write is queued", () => {
    const tracker = createSyncTracker()
    const row = deployment(1)

    tracker.queued(row)

    expect(pending(tracker)).toEqual([row.deployment_id])
  })

  it("clears the row once the write that was queued settles", () => {
    const tracker = createSyncTracker()
    const row = deployment(1)
    tracker.queued(row)

    expect(tracker.supersededBeforeSettling(row.deployment_id, row)).toBe(false)
    expect(pending(tracker)).toEqual([])
  })

  it("keeps the row pending when a newer write replaced the one that settled", () => {
    const tracker = createSyncTracker()
    const first = deployment(1, { attributes: { name: "first" } })
    const second = { ...first, attributes: { ...first.attributes, name: "second" } }
    tracker.queued(first)
    tracker.queued(second)

    expect(tracker.supersededBeforeSettling(first.deployment_id, first)).toBe(true)
    expect(pending(tracker)).toEqual([first.deployment_id])

    expect(tracker.supersededBeforeSettling(second.deployment_id, second)).toBe(false)
    expect(pending(tracker)).toEqual([])
  })

  it("releases every pending row when replication goes idle", () => {
    const tracker = createSyncTracker()
    tracker.queued(deployment(1))
    tracker.queued(deployment(2))

    tracker.idled()

    expect(pending(tracker)).toEqual([])
  })

  it("tells subscribers whenever the pending set changes", () => {
    const tracker = createSyncTracker()
    let notices = 0
    const stop = tracker.subscribe(() => {
      notices += 1
    })

    tracker.began("a")
    tracker.connectionChanged("live")
    stop()
    tracker.began("b")

    expect(notices).toBe(2)
    expect(tracker.snapshot().connection).toBe("live")
  })
})
