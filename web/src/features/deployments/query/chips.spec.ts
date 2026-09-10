import { describe, expect, it, vi } from "vitest"
import { deployments } from "@/test/deployments"
import { chipsOf, type QueryDirective } from "./chips"
import { parseQuery } from "./filter-set"
import { buildSchema } from "./schema"

const schema = buildSchema(deployments(12))

const chips = (
  query: string,
  directives: readonly QueryDirective[] = [],
  onQueryChange: (next: string) => void = () => {},
) => chipsOf(parseQuery(query, schema), directives, onQueryChange)

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

  it("appends directive chips after the clause chips", () => {
    const onRemove = vi.fn<() => void>()

    expect(chips("status:failed", [{ label: "group:team", onRemove }]).map((chip) => chip.label)).toEqual([
      "status:failed",
      "group:team",
    ])
  })

  it("removes only the clause its chip points at", () => {
    const onQueryChange = vi.fn<(next: string) => void>()

    chips("payment status:failed", [], onQueryChange)[1].onRemove()

    expect(onQueryChange).toHaveBeenCalledWith("payment")
  })

  it("clears the whole query when the unparsable chip is removed", () => {
    const onQueryChange = vi.fn<(next: string) => void>()

    chips("status:(", [], onQueryChange)[0].onRemove()

    expect(onQueryChange).toHaveBeenCalledWith("")
  })
})
