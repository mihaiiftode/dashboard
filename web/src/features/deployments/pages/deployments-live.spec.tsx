import { screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { StatusFooter } from "@/components/shell/footer-status"
import { deployments } from "@/test/deployments"
import { renderWithProviders } from "@/test/render"
import { DeploymentsPage } from "./deployments-page"

const noop = () => undefined

const findTable = () => screen.findByRole("table", undefined, { timeout: 5000 })

describe("live changes", () => {
  it("shows an edit another user made without a reload", async () => {
    const rows = deployments(6)
    const { api } = renderWithProviders(<DeploymentsPage query="" onQueryChange={noop} />, { rows })
    const table = await findTable()
    expect(within(table).getByText("service-005")).toBeVisible()

    api.emit([{ ...rows[5], attributes: { ...rows[5].attributes, name: "from-elsewhere" }, revision: 3 }])

    expect(await within(await findTable()).findByText("from-elsewhere")).toBeVisible()
  })

  it("reports a dropped connection in the footer", async () => {
    const { api } = renderWithProviders(
      <>
        <DeploymentsPage query="" onQueryChange={noop} />
        <StatusFooter />
      </>,
      { rows: deployments(3) },
    )
    await findTable()
    api.connect()
    expect(await screen.findByRole("status", { name: "Connection live" })).toBeVisible()

    api.drop()

    expect(await screen.findByRole("status", { name: "Connection reconnecting" })).toBeVisible()
  })
})
