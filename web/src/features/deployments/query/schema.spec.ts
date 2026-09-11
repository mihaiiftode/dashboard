import { describe, expect, it } from "vitest"
import { must } from "@/test/must"
import { deployment } from "@/test/deployments"
import { buildSchema } from "./schema"
import { FIXED_FIELDS, RESERVED_KEYS, resolveKey } from "./fields"
import { attributeEntrySchema } from "../store/schema"

const catalogOver = (attributes: Record<string, string>) =>
  buildSchema([deployment(1, { attributes: { name: "service-001", ...attributes } })]).catalog

describe("buildSchema", () => {
  it.each(["status", "id", "env", "version", "creator", "created", "deleted", "type"])(
    "keeps the built-in field when an attribute named %s is already stored",
    (key) => {
      const catalog = catalogOver({ [key]: "custom" })

      expect(catalog.attributeKeys).not.toContain(key)
      expect(must(resolveKey(catalog, key), `the ${key} field`).attribute).toBe(false)
    },
  )

  it("catalogs no field for the scope key even when an attribute is named is", () => {
    const catalog = catalogOver({ is: "custom" })

    expect(catalog.attributeKeys).not.toContain("is")
    expect(resolveKey(catalog, "is")).toBeUndefined()
  })

  it.each(["environment", "created_by", "deployment_id"])(
    "keeps the aliased field when an attribute named %s is already stored",
    (key) => {
      expect(catalogOver({ [key]: "custom" }).attributeKeys).not.toContain(key)
    },
  )

  it("gives every catalog field a unique identity", () => {
    const catalog = catalogOver({ status: "custom", environment: "custom", team: "payments" })
    const keys = catalog.fields.map((field) => field.key)

    expect(keys).toEqual([...new Set(keys)])
    expect(catalog.byKey.size).toBe(catalog.fields.length)
  })

  it("still catalogs an attribute that only resembles a reserved key", () => {
    expect(catalogOver({ status_page: "ok" }).attributeKeys).toContain("status_page")
  })
})

describe("reserved keys", () => {
  it("refuses every reserved key as an attribute name", () => {
    for (const key of RESERVED_KEYS)
      expect(attributeEntrySchema.safeParse({ key, value: "anything" }).success).toBe(false)
  })

  it("reserves every fixed field key", () => {
    for (const field of FIXED_FIELDS) expect(RESERVED_KEYS.has(field.key)).toBe(true)
  })
})
