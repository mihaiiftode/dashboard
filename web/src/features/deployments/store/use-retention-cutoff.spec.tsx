import { act, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { DAY_MS, RETENTION_DAYS } from "@/features/deployments/store/schema"
import { deployment } from "@/test/deployments"
import { useRetentionCutoff } from "./use-retention-cutoff"

describe("useRetentionCutoff", () => {
  afterEach(() => vi.useRealTimers())

  it("advances when the nearest deleted row reaches its retention deadline", () => {
    vi.useFakeTimers()
    const now = Date.parse("2026-09-10T12:00:00.000Z")
    vi.setSystemTime(now)
    const row = deployment(1, {
      deleted_at: new Date(now - RETENTION_DAYS * DAY_MS + 250).toISOString(),
    })
    const { result } = renderHook(() => useRetentionCutoff([row]))
    const initial = result.current

    act(() => vi.advanceTimersByTime(249))
    expect(result.current).toBe(initial)

    act(() => vi.advanceTimersByTime(1))
    expect(result.current).toBe(now - RETENTION_DAYS * DAY_MS + 250)
  })

  it("clears the scheduled retention refresh when unmounted", () => {
    vi.useFakeTimers()
    const now = Date.parse("2026-09-10T12:00:00.000Z")
    vi.setSystemTime(now)
    const row = deployment(1, {
      deleted_at: new Date(now - RETENTION_DAYS * DAY_MS + 250).toISOString(),
    })
    const { unmount } = renderHook(() => useRetentionCutoff([row]))

    expect(vi.getTimerCount()).toBe(1)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
