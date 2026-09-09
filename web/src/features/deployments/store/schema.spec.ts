import { describe, expect, it } from "vitest"
import { deploymentSchema } from "./schema"

const SEED_RECORD = {
  deployment_id: "3f1a5c7e-9b2d-4e6f-8a1b-2c3d4e5f6a7b",
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
