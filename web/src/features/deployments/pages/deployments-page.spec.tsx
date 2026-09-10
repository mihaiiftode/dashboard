import { screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { deletedDaysAgo, deployment, deployments } from "@/test/deployments"
import { columnHeader, findTable, noRowNamed, renderDeploymentsPage, rowNamed, table } from "@/test/deployments-page"
import { setupUser } from "@/test/user"

const serviceNames = () =>
  within(table())
    .getAllByRole("row")
    .slice(1)
    .map((row) => row.textContent?.match(/service-\d+/u)?.[0])
    .filter((name) => name !== undefined)

describe("DeploymentsPage", () => {
  it("renders deployment rows newest first with a promoted attribute column", async () => {
    renderDeploymentsPage({ rows: deployments(40) })

    await findTable()
    expect(columnHeader("team")).toBeVisible()
    expect(within(table()).getAllByRole("row").length).toBeGreaterThan(1)
    expect(within(table()).getByText("service-039")).toBeVisible()
    expect(within(table()).queryByText("service-000")).toBeNull()
  })

  it("shows skeleton rows while the store is still opening", () => {
    renderDeploymentsPage()

    expect(screen.getByRole("status", { name: /loading deployments/iu })).toBeVisible()
  })

  it("narrows to matching rows when the query filters a facet", async () => {
    renderDeploymentsPage({ query: "status:failed" })

    await findTable()
    expect(within(table()).getAllByRole("row").length).toBeGreaterThan(1)
    expect(within(table()).queryByText("active")).toBeNull()
  })

  it("offers a way back when nothing matches", async () => {
    renderDeploymentsPage({ query: "team:nonexistent-team" })

    expect(await screen.findByText("No deployments match", undefined, { timeout: 5000 })).toBeVisible()
    expect(screen.getByRole("button", { name: "Clear query" })).toBeVisible()
  })

  it("keeps deleted deployments out of the default scope", async () => {
    renderDeploymentsPage({ rows: [deployment(0), deployment(1, { deleted_at: deletedDaysAgo() })] })

    await findTable()
    expect(await rowNamed("service-000")).toBeVisible()
    await noRowNamed("service-001")
  })

  it("shows only deleted deployments under the deleted scope", async () => {
    renderDeploymentsPage({
      query: "is:deleted",
      rows: [deployment(0), deployment(1, { deleted_at: deletedDaysAgo() })],
    })

    await findTable()
    expect(await rowNamed("service-001")).toBeVisible()
    await noRowNamed("service-000")
  })

  it("marks a token the resolver rejected and offers to remove it", async () => {
    renderDeploymentsPage({ query: "nonsense:1", rows: deployments(6) })

    await findTable()
    expect(screen.getByText("nonsense:1")).toBeVisible()
    expect(screen.getByRole("button", { name: "Remove nonsense:1" })).toBeVisible()
  })

  it("sorts by a column when its header is clicked", async () => {
    const user = setupUser()
    renderDeploymentsPage({ rows: deployments(8) })

    await findTable()
    await user.click(within(table()).getByRole("button", { name: "name" }))

    expect(columnHeader("name")).toHaveAttribute("aria-sort", "ascending")
    expect(serviceNames()).toEqual(serviceNames().toSorted())
  })

  it("orders rows and marks the header when a sort is already applied", async () => {
    renderDeploymentsPage({ sort: { key: "name", desc: false }, rows: deployments(8) })

    await findTable()
    expect(columnHeader("name")).toHaveAttribute("aria-sort", "ascending")
    expect(serviceNames()).toEqual(serviceNames().toSorted())
  })

  it("groups by an attribute and keeps the groups expanded", async () => {
    renderDeploymentsPage({ group: "team", rows: deployments(9) })

    await findTable()
    expect(within(table()).getByText("payments")).toBeVisible()
    expect(within(table()).getAllByRole("button", { name: /collapse group/iu }).length).toBeGreaterThan(0)
  })

  it("reports the matched count in the footer the shell renders", async () => {
    renderDeploymentsPage({ footer: true, rows: deployments(12) })

    await findTable()
    expect(await screen.findByRole("status", { name: "Matched deployments" })).toHaveTextContent("12")
  })

  it("adds a filter chip when a top value is picked in the fields panel", async () => {
    const user = setupUser()
    renderDeploymentsPage({ rows: deployments(9) })

    await findTable()
    await user.click(screen.getByRole("button", { name: "Fields" }))
    const panel = screen.getByRole("complementary", { name: "Fields" })
    await user.click(within(panel).getByRole("button", { name: /^team/u }))
    await user.click(await within(panel).findByRole("button", { name: "Filter team: payments" }))

    expect(await screen.findByRole("button", { name: "Remove team:payments" })).toBeVisible()
  })

  it("lists an attribute key in the fields panel as soon as a row carries it", async () => {
    const user = setupUser()
    const rows = [deployment(0, { attributes: { oncall: "on@example.com" } }), ...deployments(8).slice(1)]
    renderDeploymentsPage({ rows })

    await findTable()
    await user.click(screen.getByRole("button", { name: "Fields" }))
    const panel = screen.getByRole("complementary", { name: "Fields" })
    expect(within(panel).queryByRole("button", { name: /^canary/u })).toBeNull()

    await user.click(within(table()).getByRole("button", { name: /edit attributes of service-000/iu }))
    await user.type(screen.getByRole("textbox", { name: "New attribute key" }), "canary")
    await user.type(screen.getByRole("textbox", { name: "New attribute value" }), "true")
    await user.click(screen.getByRole("button", { name: "Add attribute" }))

    expect(await within(panel).findByRole("button", { name: /^canary/u })).toBeVisible()
  })
})
