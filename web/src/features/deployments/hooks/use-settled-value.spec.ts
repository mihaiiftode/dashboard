import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useSettledValue } from "./use-settled-value"

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe("useSettledValue", () => {
  it("hands the first value over straight away", () => {
    const { result } = renderHook(() => useSettledValue("first", 200))

    expect(result.current).toBe("first")
  })

  it("keeps the old value until typing pauses", () => {
    const { result, rerender } = renderHook(({ value }) => useSettledValue(value, 200), {
      initialProps: { value: "t" },
    })

    for (const value of ["te", "tea", "team"]) {
      rerender({ value })
      act(() => vi.advanceTimersByTime(90))
    }
    expect(result.current).toBe("t")

    act(() => vi.advanceTimersByTime(200))
    expect(result.current).toBe("team")
  })
})
