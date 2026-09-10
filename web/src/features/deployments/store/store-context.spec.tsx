import { render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { createFakeDeploymentsApi } from "./fake-api"
import { DeploymentsStoreProvider, useDeploymentsStoreState } from "./store-context"

const Status = () => {
  const state = useDeploymentsStoreState()
  return <span data-testid="status">{state.status === "error" ? `error: ${state.error.message}` : state.status}</span>
}

const mount = (databaseName: string) =>
  render(
    <DeploymentsStoreProvider api={createFakeDeploymentsApi([])} databaseName={databaseName}>
      <Status />
    </DeploymentsStoreProvider>,
  )

describe("DeploymentsStoreProvider", () => {
  it("opens again on the same database name after an immediate unmount", async () => {
    const databaseName = `store-${crypto.randomUUID()}`

    mount(databaseName).unmount()
    const second = mount(databaseName)

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("ready"))
    second.unmount()
  })
})
