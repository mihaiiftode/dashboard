import { screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { StatusFooter } from "@/components/shell/footer-status"
import type { Deployment } from "@/features/deployments/store/schema"
import { deletedDaysAgo, deployment, deployments } from "@/test/deployments"
import { renderWithProviders } from "@/test/render"
import { setupUser } from "@/test/user"
import { DeploymentsPage } from "./deployments-page"

const noop = () => {}

const TWO_ROUND_TRIPS = 15_000

const findTable = () => screen.findByRole("table", undefined, { timeout: 5000 })

const showsRow = async (name: string) =>
  waitFor(() => expect(within(screen.getByRole("table")).getByText(name)).toBeInTheDocument())

const open = async (query: string, rows = deployments(6)) => {
  const user = setupUser()
  const rendered = renderWithProviders(
    <>
      <DeploymentsPage query={query} onQueryChange={noop} />
      <StatusFooter />
    </>,
    { rows },
  )
  return { user, table: await findTable(), ...rendered }
}

const openEmpty = async (query: string, rows: Deployment[]) => {
  const rendered = renderWithProviders(
    <>
      <DeploymentsPage query={query} onQueryChange={noop} />
      <StatusFooter />
    </>,
    { rows },
  )
  await screen.findByText("No deployments match", undefined, { timeout: 5000 })
  return rendered
}

describe("deleting and restoring", () => {
  it("takes a deleted deployment out of the default scope", async () => {
    const rows = deployments(6)
    const { user, table, api } = await open("", rows)

    await user.click(within(table).getByRole("button", { name: "Delete service-005" }))

    await waitFor(() => expect(within(table).queryByText("service-005")).toBeNull())
    expect(await screen.findByText("Deleted service-005")).toBeVisible()
    await waitFor(() => expect(api.rowFor(rows[5].deployment_id)?.deleted_at).not.toBeNull())
  })

  it(
    "brings the deployment back when the delete is undone",
    async () => {
      const rows = deployments(6)
      const { user, table, api } = await open("", rows)

      await user.click(within(table).getByRole("button", { name: "Delete service-005" }))
      await waitFor(() => expect(api.rowFor(rows[5].deployment_id)?.deleted_at).not.toBeNull())
      await user.click(await screen.findByRole("button", { name: "Undo" }))

      await showsRow("service-005")
      await waitFor(() => expect(api.rowFor(rows[5].deployment_id)?.deleted_at).toBeNull())
    },
    TWO_ROUND_TRIPS,
  )

  it("lists only deleted deployments under the deleted scope, read only, with the days left", async () => {
    const rows = [deployment(0), deployment(1, { deleted_at: deletedDaysAgo(2) })]
    const { table } = await open("is:deleted", rows)

    expect(within(table).getByText("service-001")).toBeVisible()
    expect(within(table).queryByText("service-000")).toBeNull()
    expect(within(table).getByRole("columnheader", { name: "Deleted" })).toBeVisible()
    expect(within(table).getByText(/28d left/u)).toBeVisible()
    expect(within(table).getByRole("button", { name: "Edit name: service-001" })).toBeDisabled()
    expect(within(table).getByRole("button", { name: "Restore service-001" })).toBeVisible()
  })

  it("returns a restored deployment to the default scope", async () => {
    const rows = [deployment(0), deployment(1, { deleted_at: deletedDaysAgo(2) })]
    const { user, table, api } = await open("is:deleted", rows)

    await user.click(within(table).getByRole("button", { name: "Restore service-001" }))

    expect(await screen.findByText("Restored service-001")).toBeVisible()
    await waitFor(() => expect(api.rowFor(rows[1].deployment_id)?.deleted_at).toBeNull())
  })

  it(
    "puts the deployment back in the trash when the restore is undone",
    async () => {
      const rows = [deployment(0), deployment(1, { deleted_at: deletedDaysAgo(2) })]
      const { user, table, api } = await open("is:deleted", rows)

      await user.click(within(table).getByRole("button", { name: "Restore service-001" }))
      await waitFor(() => expect(api.rowFor(rows[1].deployment_id)?.deleted_at).toBeNull())
      await user.click(await screen.findByRole("button", { name: "Undo" }))

      await showsRow("service-001")
      await waitFor(() => expect(api.rowFor(rows[1].deployment_id)?.deleted_at).not.toBeNull())
    },
    TWO_ROUND_TRIPS,
  )

  it(
    "shows a deletion that arrives while the deleted scope is open",
    async () => {
      const rows = deployments(4)
      const { api } = await openEmpty("is:deleted", rows)

      api.emit([{ ...rows[0], deleted_at: deletedDaysAgo(1), revision: 4 }])

      await waitFor(() => expect(screen.getByRole("status", { name: "Matched deployments" })).toHaveTextContent("1"))
      await showsRow("service-000")
    },
    TWO_ROUND_TRIPS,
  )

  it("groups by an attribute that has no column of its own", async () => {
    const rows = [
      deployment(0, { attributes: { cost_centre: "cc-42" } }),
      deployment(1, { attributes: { cost_centre: "cc-42" } }),
      ...deployments(10).slice(2),
    ]
    const { table } = await open("group:cost_centre", rows)

    expect(within(table).getByText("cc-42")).toBeVisible()
    expect(within(table).getAllByRole("button", { name: /collapse group/iu }).length).toBeGreaterThan(0)
  })
})
