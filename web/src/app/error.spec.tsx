import { screen } from "@testing-library/react"
import { useState } from "react"
import { describe, expect, it } from "vitest"
import { renderWithProviders } from "@/test/render"
import { setupUser } from "@/test/user"
import ErrorPage from "./error"

const Recoverable = () => {
  const [recovered, setRecovered] = useState(false)
  if (recovered) return <p>Dashboard is back</p>
  return <ErrorPage error={new Error("database unreachable")} reset={() => setRecovered(true)} />
}

describe("ErrorPage", () => {
  it("shows the failure and lets the user retry", async () => {
    const user = setupUser()
    renderWithProviders(<Recoverable />)

    expect(screen.getByRole("alert")).toHaveTextContent("database unreachable")

    await user.click(screen.getByRole("button", { name: "Try again" }))

    expect(screen.getByText("Dashboard is back")).toBeInTheDocument()
  })
})
