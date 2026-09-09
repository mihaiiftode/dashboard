import { screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { renderWithProviders } from "@/test/render"
import { FooterBar } from "./footer-bar"

describe("FooterBar", () => {
  it("shows placeholders for the row window, matched count, and sync state before data arrives", () => {
    renderWithProviders(<FooterBar sync="connecting" />)
    const footer = screen.getByRole("contentinfo")
    expect(within(footer).getByRole("status", { name: "Matched deployments" })).toHaveTextContent("—")
    expect(within(footer).getByText("connecting")).toBeVisible()
    expect(within(footer).queryByText(/total/u)).toBeNull()
  })

  it("names the connection state for assistive technology", () => {
    renderWithProviders(<FooterBar sync="reconnecting" />)

    expect(screen.getByRole("status", { name: "Connection reconnecting" })).toHaveTextContent("reconnecting")
  })

  it("marks an offline connection as a problem", () => {
    renderWithProviders(<FooterBar sync="offline" />)

    expect(screen.getByRole("status", { name: "Connection offline" })).toHaveClass("text-destructive")
  })
})
