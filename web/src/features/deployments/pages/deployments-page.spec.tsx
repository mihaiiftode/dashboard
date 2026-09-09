import { screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { renderWithProviders } from "@/test/render"
import { DeploymentsPage } from "./deployments-page"

const noop = () => undefined

describe("DeploymentsPage", () => {
  it("renders deployment rows with a promoted attribute column", () => {
    renderWithProviders(<DeploymentsPage query="" onQueryChange={noop} />)

    const table = screen.getByRole("table")
    expect(within(table).getByRole("columnheader", { name: /team/i })).toBeVisible()
    expect(within(table).getAllByRole("row").length).toBeGreaterThan(1)
  })

  it("narrows to matching rows when the query filters a facet", () => {
    renderWithProviders(<DeploymentsPage query="status:failed" onQueryChange={noop} />)

    const table = screen.getByRole("table")
    expect(within(table).getAllByText("failed").length).toBeGreaterThan(0)
    expect(within(table).queryByText("active")).toBeNull()
  })

  it("shows the empty state when nothing matches", () => {
    renderWithProviders(<DeploymentsPage query="team:nonexistent-team" onQueryChange={noop} />)

    expect(screen.getByText("No deployments match")).toBeVisible()
    expect(screen.queryByRole("table")).toBeNull()
  })
})
