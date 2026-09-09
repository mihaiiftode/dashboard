import { describe, expect, it } from "vitest"
import { buildDataset } from "@/lib/mock-data"
import { buildSchema } from "../../query/schema"
import { columnsFor, type RowActions } from "./columns"

const actions: RowActions = {
  pendingIds: new Set(),
  onSetAttribute: () => undefined,
  onDelete: () => undefined,
  onRestore: () => undefined,
  onCopyId: () => undefined,
}

const schema = buildSchema(buildDataset(200))
const fieldsFor = (keys: string[]) => keys.map((key) => schema.byKey.get(key)).filter((field) => field !== undefined)

describe("columnsFor", () => {
  it("returns one column per visible field, in order", () => {
    const columns = columnsFor(schema, fieldsFor(["name", "status", "team"]), [], actions)

    expect(columns.map((column) => column.id)).toEqual(["name", "status", "team", "actions"])
  })

  it("adds the packed attributes column only when attributes stay hidden", () => {
    const withHidden = columnsFor(schema, fieldsFor(["name"]), ["region"], actions)
    const withoutHidden = columnsFor(schema, fieldsFor(["name"]), [], actions)

    expect(withHidden.map((column) => column.id)).toContain("attributes")
    expect(withoutHidden.map((column) => column.id)).not.toContain("attributes")
  })
})
