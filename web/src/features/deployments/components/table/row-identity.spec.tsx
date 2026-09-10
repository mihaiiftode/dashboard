import { describe, expect, it } from "vitest"
import { waitFor, within } from "@testing-library/react"
import { deployment } from "@/test/deployments"
import { columnHeader, findTable, renderDeploymentsPage, table } from "@/test/deployments-page"
import { setupUser } from "@/test/user"
import { must } from "@/test/must"

const rowFor = (name: string) => within(table()).getByText(name).closest("[data-slot='table-row']")

const namesInOrder = () =>
  within(table())
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[1]?.textContent?.trim())

describe("row identity", () => {
  const rows = [
    deployment(1, { attributes: { name: "alpha" } }),
    deployment(2, { attributes: { name: "bravo" } }),
    deployment(3, { attributes: { name: "charlie" } }),
  ]

  it("moves a deployment's own row element when the order reverses", async () => {
    const user = setupUser()
    renderDeploymentsPage({ rows, sort: { key: "name", desc: false } })
    await findTable()

    const alphaBefore = rowFor("alpha")
    expect(namesInOrder()).toEqual(["alpha", "bravo", "charlie"])

    const header = must(columnHeader("name"), "the name column header")
    await user.click(within(header).getByRole("button"))
    await waitFor(() => expect(namesInOrder()).toEqual(["charlie", "bravo", "alpha"]))

    expect(rowFor("alpha")).toBe(alphaBefore)
  })
})
