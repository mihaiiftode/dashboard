import { screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { deletedDaysAgo, deployment, deployments } from "@/test/deployments"
import { renderWithProviders } from "@/test/render"
import { setupUser } from "@/test/user"
import { DeploymentsPage } from "./deployments-page"

const noop = () => {}

const findTable = () => screen.findByRole("table", undefined, { timeout: 5000 })

const pendingRows = async () =>
  (await screen.findAllByRole("status", { name: "Loading" })).map(
    (spinner) => spinner.closest("[data-slot='table-row']")?.textContent ?? "",
  )

const openBrowser = async (rows = deployments(6)) => {
  const user = setupUser()
  const rendered = renderWithProviders(<DeploymentsPage query="" onQueryChange={noop} />, { rows })
  const table = await findTable()
  return { user, table, ...rendered }
}

describe("editing a deployment", () => {
  it("saves a typed value and sends it to the API", async () => {
    const rows = deployments(6)
    const { user, table, api } = await openBrowser(rows)

    await user.click(within(table).getByRole("button", { name: "Edit name: service-005" }))
    await user.keyboard("payments-api{Enter}")

    expect(await within(table).findByText("payments-api")).toBeVisible()
    await waitFor(() => expect(api.rowFor(rows[5].deployment_id)?.attributes.name).toBe("payments-api"))
    expect(api.writes[0]).toMatchObject({ id: rows[5].deployment_id, expectedRevision: 1 })
  })

  it("saves a value picked from the suggestions of a chip field", async () => {
    const rows = deployments(6)
    const { user, table, api } = await openBrowser(rows)

    await user.click(within(table).getAllByRole("button", { name: /^Edit priority/u })[0])
    await user.click(await screen.findByRole("option", { name: /low/u }))

    await waitFor(() => expect(api.writes).toHaveLength(1))
    expect(api.rowFor(api.writes[0].id)?.attributes.priority).toBe("low")
  })

  it("keeps the stored value when the edit is cancelled", async () => {
    const { user, table, api } = await openBrowser()

    await user.click(within(table).getByRole("button", { name: "Edit name: service-005" }))
    await user.keyboard("throwaway{Escape}")

    expect(within(table).getByRole("button", { name: "Edit name: service-005" })).toBeVisible()
    expect(api.writes).toHaveLength(0)
  })

  it("refuses to clear the name and explains why", async () => {
    const { user, table, api } = await openBrowser()

    await user.click(within(table).getByRole("button", { name: "Edit name: service-005" }))
    await user.clear(screen.getByRole("textbox", { name: "Edit value" }))
    await user.keyboard("{Enter}")

    expect(await screen.findByText("Name is required")).toBeVisible()
    expect(api.writes).toHaveLength(0)
    expect(within(table).getByRole("button", { name: "Edit name: service-005" })).toBeVisible()
  })

  it("reverts to the winning value and names it when someone else wrote first", async () => {
    const rows = deployments(6)
    const { user, table, api } = await openBrowser(rows)
    api.store({ ...rows[5], attributes: { ...rows[5].attributes, name: "theirs" }, revision: 9 })

    await user.click(within(table).getByRole("button", { name: "Edit name: service-005" }))
    await user.keyboard("mine{Enter}")

    expect(await screen.findByText(/changed elsewhere/u)).toBeVisible()
    expect(await screen.findByText(/Kept name theirs instead of mine/u)).toBeVisible()
    expect(await within(await findTable()).findByText("theirs")).toBeVisible()
  })

  it("offers no editing on a deleted deployment", async () => {
    const rows = [deployment(0), deployment(1, { deleted_at: deletedDaysAgo() })]
    const { table } = await openBrowser(rows)

    expect(within(table).getByRole("button", { name: "Edit name: service-000" })).toBeEnabled()
    expect(within(table).queryByRole("button", { name: /Edit name: service-001/u })).toBeNull()
  })

  it("marks the row pending until the write settles", async () => {
    const rows = deployments(6)
    const { user, table, api } = await openBrowser(rows)
    const release = api.holdWrites()

    await user.click(within(table).getByRole("button", { name: "Edit name: service-005" }))
    await user.keyboard("payments-api{Enter}")

    await within(table).findByText("payments-api")
    expect((await pendingRows()).every((text) => text.includes("payments-api"))).toBe(true)

    release()

    await waitFor(() => expect(screen.queryAllByRole("status", { name: "Loading" })).toHaveLength(0))
  })

  it("sends an attribute added in the popover through the same write path", async () => {
    const rows = [deployment(0, { attributes: { oncall: "on@example.com" } }), ...deployments(8).slice(1)]
    const { user, table, api } = await openBrowser(rows)

    await user.click(within(table).getByRole("button", { name: /edit attributes of service-000/iu }))
    await user.type(screen.getByRole("textbox", { name: "New attribute key" }), "cost_centre")
    await user.type(screen.getByRole("textbox", { name: "New attribute value" }), "cc-42")
    await user.click(screen.getByRole("button", { name: "Add attribute" }))

    await waitFor(() => expect(api.rowFor(rows[0].deployment_id)?.attributes.cost_centre).toBe("cc-42"))
    expect(api.writes[0]).toMatchObject({ id: rows[0].deployment_id, expectedRevision: 1 })
  })
})
