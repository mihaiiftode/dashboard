import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useMockDeployments } from "./use-mock-deployments"

const CONFLICT_VALUE = "conflict-team"
const SYNC_DELAY_MS = 700

describe("useMockDeployments", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it("reverts a conflicting edit even when a second edit starts before the first syncs", () => {
    const { result } = renderHook(() => useMockDeployments())
    const [first, second] = result.current.rows
    const original = first.attributes.team

    act(() => result.current.setAttribute(first.deployment_id, "team", CONFLICT_VALUE))
    act(() => result.current.setAttribute(second.deployment_id, "team", "platform"))
    act(() => vi.advanceTimersByTime(SYNC_DELAY_MS * 2))

    const reverted = result.current.rows.find((row) => row.deployment_id === first.deployment_id)
    expect(reverted?.attributes.team).toBe(original)
    expect(result.current.pendingIds.size).toBe(0)
  })
})
