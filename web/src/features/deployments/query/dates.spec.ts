import { describe, expect, it, vi } from "vitest"
import { parseCalendarDay, startOfCalendarDay, startOfNextDay, today } from "./dates"

const boundsOf = (day: string) => {
  const parsed = parseCalendarDay(day)
  if (!parsed) throw new Error(`expected ${day} to parse`)
  return { from: startOfCalendarDay(parsed), to: startOfNextDay(parsed) }
}

describe("parseCalendarDay", () => {
  it("reads a calendar day as the UTC start of that day", () => {
    expect(startOfCalendarDay(parseCalendarDay("2026-09-10")!)).toBe("2026-09-10T00:00:00.000000Z")
  })

  it.each([
    "2026-02-30",
    "2026-13-01",
    "not-a-day",
    "",
    "2026-09-10T05:00:00Z",
    "2026-9-9",
    "2026-09-9",
    "26-09-09",
    "2026-09-10 ",
  ])("rejects %s", (value) => {
    expect(parseCalendarDay(value)).toBeNull()
  })
})

describe("day bounds", () => {
  it("matches the stored six-digit fraction so a midnight row lands in its own day", () => {
    const midnight = "2026-09-10T00:00:00.000000Z"
    const { from, to } = boundsOf("2026-09-10")

    expect(midnight >= from).toBe(true)
    expect(midnight < to).toBe(true)
  })

  it("excludes the first instant of the following day", () => {
    expect("2026-09-11T00:00:00.000000Z" < boundsOf("2026-09-10").to).toBe(false)
  })

  it.each([
    ["2026-09-10", "2026-09-11T00:00:00.000000Z"],
    ["2026-10-25", "2026-10-26T00:00:00.000000Z"],
    ["2026-12-31", "2027-01-01T00:00:00.000000Z"],
    ["2024-02-28", "2024-02-29T00:00:00.000000Z"],
  ])("takes the day after %s regardless of the local zone", (day, next) => {
    expect(boundsOf(day).to).toBe(next)
  })
})

describe("today", () => {
  it("reads the UTC calendar day rather than the local one", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-09-10T23:00:00.000Z"))

    expect(today()).toBe("2026-09-10")

    vi.useRealTimers()
  })
})
