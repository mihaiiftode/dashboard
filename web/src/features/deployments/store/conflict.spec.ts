import { describe, expect, it } from "vitest"
import { deployment } from "@/test/deployments"
import { conflictBetween, differencesBetween } from "./conflict"

const mine = deployment(1)

describe("differencesBetween", () => {
  it("finds nothing when the winning document carries the same values", () => {
    expect(differencesBetween(mine, { ...mine, revision: 9, updated_at: "2026-04-01T00:00:00.000Z" })).toEqual([])
  })

  it("names a fixed field the winner holds differently", () => {
    expect(differencesBetween(mine, { ...mine, status: "stopped" })).toEqual([
      { key: "status", attempted: mine.status, winning: "stopped" },
    ])
  })

  it("names an attribute the winner holds differently", () => {
    const theirs = { ...mine, attributes: { ...mine.attributes, team: "search" } }

    expect(differencesBetween(mine, theirs)).toEqual([
      { key: "team", attempted: mine.attributes.team, winning: "search" },
    ])
  })

  it("reports an attribute the winner removed", () => {
    const { region, ...withoutRegion } = mine.attributes
    const theirs = { ...mine, attributes: withoutRegion }

    expect(differencesBetween(mine, theirs)).toEqual([{ key: "region", attempted: region, winning: "" }])
  })

  it("reports an attribute only the winner carries", () => {
    const theirs = { ...mine, attributes: { ...mine.attributes, oncall: "on@example.com" } }

    expect(differencesBetween(mine, theirs)).toEqual([{ key: "oncall", attempted: "", winning: "on@example.com" }])
  })
})

describe("conflictBetween", () => {
  it("reports no conflict when only the revision moved", () => {
    expect(conflictBetween(mine, { ...mine, revision: 4 })).toBeNull()
  })

  it("carries the winning document alongside the differences", () => {
    const theirs = { ...mine, attributes: { ...mine.attributes, name: "theirs" } }

    expect(conflictBetween(mine, theirs)).toEqual({
      deployment: theirs,
      differences: [{ key: "name", attempted: mine.attributes.name, winning: "theirs" }],
    })
  })
})
