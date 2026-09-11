import { describe, expect, it } from "vitest"
import { absoluteTime, relativeTime, shortId } from "./format"

const NOW = Date.parse("2026-03-01T12:00:00.000Z")
const ago = (ms: number) => new Date(NOW - ms).toISOString()

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

describe("relativeTime", () => {
  it.each([
    [30 * SECOND, "30 seconds ago"],
    [5 * MINUTE, "5 minutes ago"],
    [3 * HOUR, "3 hours ago"],
    [11 * DAY, "11 days ago"],
    [400 * DAY, "1 year ago"],
  ])("reads %i ms back as %s", (elapsed, expected) => {
    expect(relativeTime(ago(elapsed), NOW)).toBe(expected)
  })

  it("marks a future instant as ahead", () => {
    expect(relativeTime(new Date(NOW + 2 * DAY).toISOString(), NOW)).toBe("in 2 days")
  })
})

describe("absoluteTime", () => {
  it("reads an instant in UTC whatever the offset it was written with", () => {
    expect(absoluteTime("2026-03-01T12:00:00.000Z")).toBe("1 Mar 2026, 12:00 UTC")
    expect(absoluteTime("2026-03-01T14:00:00.000+02:00")).toBe("1 Mar 2026, 12:00 UTC")
  })
})

describe("shortId", () => {
  it("keeps the first block of a uuid", () => {
    expect(shortId("6c35f154-edeb-41f1-9e86-bd324a11a85e")).toBe("6c35f154")
  })
})
