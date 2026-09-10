import { describe, expect, it } from "vitest"
import { deployments } from "@/test/deployments"
import { chipsOf } from "./chips"
import { withoutClause } from "./query-edits"
import { parseQuery, type Span } from "./parse-query"
import { buildSchema } from "./schema"

const { catalog } = buildSchema(deployments(12))

const chips = (query: string) => chipsOf(parseQuery(query, catalog))

describe("chipsOf", () => {
  it("reads a resolved field clause as a plain secondary chip", () => {
    expect(chips("status:failed")[0]).toMatchObject({ label: "status:failed", variant: "secondary", issue: null })
  })

  it("quotes bare text and outlines it", () => {
    expect(chips("payment")[0]).toMatchObject({ label: "“payment”", variant: "outline" })
  })

  it("marks an unresolved clause destructive and carries its issue", () => {
    expect(chips("nonsense:1")[0]).toMatchObject({ label: "nonsense:1", variant: "destructive" })
    expect(chips("nonsense:1")[0].issue).not.toBeNull()
  })

  it("collapses an unparsable query into one chip over the whole source", () => {
    expect(chips("status:(")).toMatchObject([{ key: "syntax", label: "status:(", variant: "destructive" }])
  })

  it("reads an empty query as no chips", () => {
    expect(chips("")).toEqual([])
  })

  it("keys each chip by where its clause starts so repeats stay distinct", () => {
    expect(chips("status:failed status:failed").map((chip) => chip.key)).toEqual(["0", "14"])
  })

  it("removes only the clause its chip points at", () => {
    const document = parseQuery("payment status:failed", catalog)
    const chip = chipsOf(document)[1]

    expect(chip.span).not.toBeNull()
    expect(withoutClause(document, chip.span as Span)).toBe("payment")
  })

  it("represents invalid source removal without a clause span", () => {
    expect(chips("status:(")[0].span).toBeNull()
  })
})
