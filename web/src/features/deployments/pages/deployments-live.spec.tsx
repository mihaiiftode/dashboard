import { screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { deployments } from "@/test/deployments"
import { findTable, renderDeploymentsPage } from "@/test/deployments-page"

describe("live changes", () => {
  it("shows an edit another user made without a reload", async () => {
    const rows = deployments(6)
    const { api } = renderDeploymentsPage({ rows })
    const table = await findTable()
    expect(within(table).getByText("service-005")).toBeVisible()

    api.emit([{ ...rows[5], attributes: { ...rows[5].attributes, name: "from-elsewhere" }, revision: 3 }])

    expect(await within(await findTable()).findByText("from-elsewhere")).toBeVisible()
  })

  it("reports a dropped connection in the footer", async () => {
    const { api } = renderDeploymentsPage({ footer: true, rows: deployments(3) })
    await findTable()
    api.connect()
    expect(await screen.findByRole("status", { name: "Connection live" })).toBeVisible()

    api.drop()

    expect(await screen.findByRole("status", { name: "Connection reconnecting" })).toBeVisible()
  })
})
