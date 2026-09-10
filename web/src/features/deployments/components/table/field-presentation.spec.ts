import { describe, expect, it } from "vitest"
import { deployments } from "@/test/deployments"
import { buildSchema } from "../../query/schema"
import { groupCandidates } from "./field-presentation"

const { catalog } = buildSchema(deployments(12))

describe("groupCandidates", () => {
  it("offers every facet and attribute but never a date or the identifier", () => {
    const offered = groupCandidates(catalog).map((field) => field.key)

    expect(offered).toContain("status")
    expect(offered).toContain("team")
    expect(offered).not.toContain("created")
    expect(offered).not.toContain("deleted")
    expect(offered).not.toContain("id")
  })
})
