import { renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { deployment } from "@/test/deployments"
import { useFieldSchema } from "./use-field-schema"

const renderOver = (rows: ReturnType<typeof deployment>[]) =>
  renderHook(({ rows: current }) => useFieldSchema(current), { initialProps: { rows } })

describe("useFieldSchema", () => {
  it("keeps the catalog identity when an edit leaves the attribute keys alone", () => {
    const { result, rerender } = renderOver([deployment(1, { attributes: { team: "payments" } })])
    const before = result.current.catalog

    rerender({ rows: [deployment(1, { attributes: { team: "checkout" } })] })

    expect(result.current.catalog).toBe(before)
    expect(result.current.statistics.distinct.get("team")?.get("checkout")).toBe(1)
  })

  it("rebuilds the catalog when a new attribute key appears", () => {
    const { result, rerender } = renderOver([deployment(1)])
    const before = result.current.catalog

    rerender({ rows: [deployment(1, { attributes: { oncall: "platform" } })] })

    expect(result.current.catalog).not.toBe(before)
    expect(result.current.catalog.attributeKeys).toContain("oncall")
  })
})
