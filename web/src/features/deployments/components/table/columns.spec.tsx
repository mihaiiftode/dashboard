import { describe, expect, it } from "vitest"
import { deployments } from "@/test/deployments"
import { buildSchema } from "@/test/schema"
import { columnsFor, type RowActions } from "./columns"

const actions: RowActions = {
  onSetAttribute: () => {},
  onDelete: () => {},
  onRestore: () => {},
  onCopyId: () => {},
}

const { catalog, statistics } = buildSchema(deployments(200))
const fieldsFor = (keys: string[]) => keys.map((key) => catalog.byKey.get(key)).filter((field) => field !== undefined)

describe("columnsFor", () => {
  it("returns one column per visible field, in order", () => {
    const columns = columnsFor(statistics, fieldsFor(["name", "status", "team"]), [], actions)

    expect(columns.map((column) => column.id)).toEqual(["name", "status", "team", "actions"])
  })

  it("adds the packed attributes column only when attributes stay hidden", () => {
    const withHidden = columnsFor(statistics, fieldsFor(["name"]), ["region"], actions)
    const withoutHidden = columnsFor(statistics, fieldsFor(["name"]), [], actions)

    expect(withHidden.map((column) => column.id)).toContain("attributes")
    expect(withoutHidden.map((column) => column.id)).not.toContain("attributes")
  })
})
