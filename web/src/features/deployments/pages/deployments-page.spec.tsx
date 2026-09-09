import { screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { StatusFooter } from "@/components/shell/footer-status"
import { deployment, deployments } from "@/test/deployments"
import { renderWithProviders } from "@/test/render"
import { DeploymentsPage } from "./deployments-page"

const noop = () => undefined

const findTable = () => screen.findByRole("table", undefined, { timeout: 5000 })

describe("DeploymentsPage", () => {
  it("renders deployment rows with a promoted attribute column once the store is ready", async () => {
    renderWithProviders(<DeploymentsPage query="" onQueryChange={noop} />)

    const table = await findTable()
    expect(within(table).getByRole("columnheader", { name: /team/i })).toBeVisible()
    expect(within(table).getAllByRole("row").length).toBeGreaterThan(1)
    expect(within(table).getByText("service-000")).toBeVisible()
  })

  it("shows skeleton rows while the store is still opening", () => {
    renderWithProviders(<DeploymentsPage query="" onQueryChange={noop} />)

    expect(screen.getByRole("status", { name: /loading deployments/i })).toBeVisible()
  })

  it("narrows to matching rows when the query filters a facet", async () => {
    renderWithProviders(<DeploymentsPage query="status:failed" onQueryChange={noop} />)

    const table = await findTable()
    expect(within(table).getAllByText("failed").length).toBeGreaterThan(0)
    expect(within(table).queryByText("active")).toBeNull()
  })

  it("shows the empty state when nothing matches", async () => {
    renderWithProviders(<DeploymentsPage query="team:nonexistent-team" onQueryChange={noop} />)

    expect(await screen.findByText("No deployments match")).toBeVisible()
    expect(screen.queryByRole("table")).toBeNull()
  })

  it("hides deleted deployments from the default scope and shows them under the deleted scope", async () => {
    const rows = [deployment(0), deployment(1, { deleted_at: "2026-03-02T09:00:00.000Z" })]
    const { rerender } = renderWithProviders(<DeploymentsPage query="" onQueryChange={noop} />, { rows })

    const table = await findTable()
    expect(within(table).getByText("service-000")).toBeVisible()
    expect(within(table).queryByText("service-001")).toBeNull()

    rerender(<DeploymentsPage query="is:deleted" onQueryChange={noop} />)

    const deletedScope = await findTable()
    expect(within(deletedScope).getByText("service-001")).toBeVisible()
    expect(within(deletedScope).queryByText("service-000")).toBeNull()
  })

  it("reports the matched count in the footer the shell renders", async () => {
    renderWithProviders(
      <>
        <DeploymentsPage query="" onQueryChange={noop} />
        <StatusFooter />
      </>,
      { rows: deployments(3) },
    )

    await findTable()
    const footer = screen.getByRole("contentinfo")
    expect(within(footer).getByRole("status")).toHaveTextContent("3")
  })
})
