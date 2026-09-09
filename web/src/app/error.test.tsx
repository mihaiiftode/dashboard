import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it } from "vitest"
import ErrorPage from "./error"

function Recoverable() {
  const [recovered, setRecovered] = useState(false)
  if (recovered) return <p>Dashboard is back</p>
  return <ErrorPage error={new Error("database unreachable")} reset={() => setRecovered(true)} />
}

describe("ErrorPage", () => {
  it("shows the failure and lets the user retry", async () => {
    render(<Recoverable />)

    expect(screen.getByRole("alert")).toHaveTextContent("database unreachable")

    await userEvent.click(screen.getByRole("button", { name: "Try again" }))

    expect(screen.getByText("Dashboard is back")).toBeInTheDocument()
  })
})
