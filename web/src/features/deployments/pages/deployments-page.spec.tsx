import { screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { StatusFooter } from "@/components/shell/footer-status"
import { deletedDaysAgo, deployment, deployments } from "@/test/deployments"
import { renderWithProviders } from "@/test/render"
import { setupUser } from "@/test/user"
import { DeploymentsPage } from "./deployments-page"

const noop = () => undefined

const findTable = () => screen.findByRole("table", undefined, { timeout: 5000 })

describe("DeploymentsPage", () => {
  it("renders deployment rows newest first with a promoted attribute column", async () => {
    renderWithProviders(<DeploymentsPage query="" onQueryChange={noop} />, { rows: deployments(40) })

    const table = await findTable()
    expect(within(table).getByRole("columnheader", { name: /team/i })).toBeVisible()
    expect(within(table).getAllByRole("row").length).toBeGreaterThan(1)
    expect(within(table).getByText("service-039")).toBeVisible()
    expect(within(table).queryByText("service-000")).toBeNull()
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
    const rows = [deployment(0), deployment(1, { deleted_at: deletedDaysAgo() })]
    const { rerender } = renderWithProviders(<DeploymentsPage query="" onQueryChange={noop} />, { rows })

    const table = await findTable()
    expect(within(table).getByText("service-000")).toBeVisible()
    expect(within(table).queryByText("service-001")).toBeNull()

    rerender(<DeploymentsPage query="is:deleted" onQueryChange={noop} />)

    await waitFor(() => expect(within(screen.getByRole("table")).getByText("service-001")).toBeInTheDocument())
    expect(within(screen.getByRole("table")).queryByText("service-000")).toBeNull()
  })

  it("renders a destructive chip with a tooltip for an invalid token and ignores it", async () => {
    renderWithProviders(<DeploymentsPage query="nonsense:1" onQueryChange={noop} />, { rows: deployments(6) })

    const table = await findTable()
    expect(within(table).getAllByRole("row").length).toBeGreaterThan(1)
    const chip = screen.getByText("nonsense:1")
    expect(chip).toBeVisible()
    expect(screen.getByRole("button", { name: "Remove nonsense:1" })).toBeVisible()
  })

  it("writes the sort directive into the query when a header is clicked", async () => {
    const user = setupUser()
    const queries: string[] = []
    const record = (next: string | ((previous: string) => string)) =>
      queries.push(typeof next === "function" ? next("") : next)
    renderWithProviders(<DeploymentsPage query="" onQueryChange={record} />, { rows: deployments(8) })

    const table = await findTable()
    await user.click(within(table).getByRole("button", { name: "name" }))

    expect(queries.at(-1)).toBe("sort:name")
  })

  it("orders rows and marks the header when the sort directive is set", async () => {
    renderWithProviders(<DeploymentsPage query="sort:name" onQueryChange={noop} />, { rows: deployments(8) })

    const table = await findTable()
    const header = within(table)
      .getAllByRole("columnheader")
      .find((cell) => cell.textContent?.trim() === "name")
    expect(header).toHaveAttribute("aria-sort", "ascending")
    const names = within(table)
      .getAllByRole("row")
      .slice(1)
      .map((row) => row.textContent?.match(/service-\d+/)?.[0])
      .filter((name) => name !== undefined)
    expect(names).toEqual([...names].sort())
  })

  it("groups by an attribute and keeps the groups expanded", async () => {
    renderWithProviders(<DeploymentsPage query="group:team" onQueryChange={noop} />, { rows: deployments(9) })

    const table = await findTable()
    expect(within(table).getByText("payments")).toBeVisible()
    expect(within(table).getAllByRole("button", { name: /collapse group/i }).length).toBeGreaterThan(0)
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
    expect(within(footer).getByRole("status", { name: "Matched deployments" })).toHaveTextContent("3")
  })
  it("shows a hidden attribute column when its column toggle is pressed in the fields panel", async () => {
    const user = setupUser()
    const rows = [deployment(0, { attributes: { oncall: "on@example.com" } }), ...deployments(8).slice(1)]
    renderWithProviders(<DeploymentsPage query="" onQueryChange={noop} />, { rows })

    const table = await findTable()
    expect(within(table).queryByRole("columnheader", { name: /oncall/i })).toBeNull()
    await user.click(screen.getByRole("button", { name: "Fields" }))
    await user.click(await screen.findByRole("button", { name: "Show oncall column" }))

    expect(within(await findTable()).getByRole("columnheader", { name: /oncall/i })).toBeVisible()
  })

  it("adds a filter token when a top value is picked in the fields panel", async () => {
    const user = setupUser()
    const queries: string[] = []
    const record = (next: string | ((previous: string) => string)) =>
      queries.push(typeof next === "function" ? next("") : next)
    renderWithProviders(<DeploymentsPage query="" onQueryChange={record} />, { rows: deployments(9) })

    await findTable()
    await user.click(screen.getByRole("button", { name: "Fields" }))
    const panel = screen.getByRole("complementary", { name: "Fields" })
    await user.click(within(panel).getByRole("button", { name: /^team/ }))
    await user.click(await within(panel).findByRole("button", { name: "Filter team: payments" }))

    expect(queries.at(-1)).toBe("team:payments")
  })

  it("lists an attribute key in the fields panel as soon as a row carries it", async () => {
    const user = setupUser()
    const rows = [deployment(0, { attributes: { oncall: "on@example.com" } }), ...deployments(8).slice(1)]
    renderWithProviders(<DeploymentsPage query="" onQueryChange={noop} />, { rows })

    const table = await findTable()
    await user.click(screen.getByRole("button", { name: "Fields" }))
    const panel = screen.getByRole("complementary", { name: "Fields" })
    expect(within(panel).queryByRole("button", { name: /^canary/ })).toBeNull()

    await user.click(within(table).getByRole("button", { name: /edit attributes of service-000/i }))
    await user.type(screen.getByRole("textbox", { name: "New attribute key" }), "canary")
    await user.type(screen.getByRole("textbox", { name: "New attribute value" }), "true")
    await user.click(screen.getByRole("button", { name: "Add attribute" }))

    expect(await within(panel).findByRole("button", { name: /^canary/ })).toBeVisible()
  })
})
