import { describe, expect, it } from "vitest"
import { attributeEntrySchema, deploymentSchema, REQUIRED_ATTRIBUTE_KEYS } from "./schema"

const SEED_RECORD = {
  deployment_id: "3f1a5c7e-9b2d-4e6f-8a1b-2c3d4e5f6a7b",
  revision: 1,
  version: "2.14.3",
  status: "active",
  type: "web_service",
  environment: "production",
  attributes: {
    name: "payment-api",
    description: "Handles card authorisation for checkout.",
    team: "payments",
    region: "eu-west-1",
    oncall: "oncall@example.com",
    cost_centre: "cc-42",
  },
  created_at: "2026-02-11T09:15:00+00:00",
  created_by: "engineer@example.com",
  updated_at: "2026-03-04T17:42:00+00:00",
  deleted_at: null,
}

const withRecord = (overrides: Record<string, unknown>) => ({ ...SEED_RECORD, ...overrides })
const withoutAttribute = (key: string): Record<string, string> =>
  Object.fromEntries(Object.entries<string>(SEED_RECORD.attributes).filter(([name]) => name !== key))
const withAttributes = (overrides: Record<string, unknown>) => ({
  attributes: { ...SEED_RECORD.attributes, ...overrides },
})

describe("deploymentSchema", () => {
  it("accepts a seed record and keeps unknown attribute keys", () => {
    const parsed = deploymentSchema.parse(SEED_RECORD)

    expect(parsed.attributes.name).toBe("payment-api")
    expect(parsed.attributes.cost_centre).toBe("cc-42")
    expect(parsed.deleted_at).toBeNull()
  })

  it("rejects a record without a name", () => {
    expect(deploymentSchema.safeParse(withRecord({ attributes: { team: "payments" } })).success).toBe(false)
  })

  it.each(["paused", ""])("rejects the status %s", (status) => {
    expect(deploymentSchema.safeParse(withRecord({ status })).success).toBe(false)
  })

  it.each(["Region", "region!", "r".repeat(65)])("rejects the attribute key %s", (key) => {
    expect(deploymentSchema.safeParse(withRecord(withAttributes({ [key]: "value" }))).success).toBe(false)
  })

  it.each(["", "v".repeat(513)])("rejects an attribute value of length %s", (value) => {
    expect(deploymentSchema.safeParse(withRecord(withAttributes({ team: value }))).success).toBe(false)
  })

  it("rejects a non-email oncall", () => {
    expect(deploymentSchema.safeParse(withRecord(withAttributes({ oncall: "pager" }))).success).toBe(false)
  })

  it("rejects a non-email creator", () => {
    expect(deploymentSchema.safeParse(withRecord({ created_by: "engineer" })).success).toBe(false)
  })
})

describe("REQUIRED_ATTRIBUTE_KEYS", () => {
  it.each([...REQUIRED_ATTRIBUTE_KEYS])("names %s, which the record cannot omit", (key) => {
    expect(deploymentSchema.safeParse(withRecord({ attributes: withoutAttribute(key) })).success).toBe(false)
  })

  it.each(Object.keys(SEED_RECORD.attributes).filter((key) => !REQUIRED_ATTRIBUTE_KEYS.has(key)))(
    "omits %s, which the record allows to be absent",
    (key) => {
      expect(deploymentSchema.safeParse(withRecord({ attributes: withoutAttribute(key) })).success).toBe(true)
    },
  )
})

describe("attributeEntrySchema", () => {
  it.each([
    ["cost_centre", "cc-42", true],
    ["  Cost_Centre  ", "cc-42", true],
    ["region!", "eu-west-1", false],
    ["team", "   ", false],
    ["oncall", "pager", false],
    ["oncall", "oncall@example.com", true],
  ])("reads %s=%s as valid %s", (key, value, valid) => {
    expect(attributeEntrySchema.safeParse({ key, value }).success).toBe(valid)
  })

  it("normalises the key it returns", () => {
    expect(attributeEntrySchema.parse({ key: "  Cost_Centre  ", value: "cc-42" }).key).toBe("cost_centre")
  })
})
