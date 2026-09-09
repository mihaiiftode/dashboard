import { screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { renderWithProviders } from "@/test/render"
import { FooterBar } from "./footer-bar"

describe("FooterBar", () => {
  it("shows placeholders for the row window, matched count, and sync state before data arrives", () => {
    renderWithProviders(<FooterBar sync="connecting" />)
    const footer = screen.getByRole("contentinfo")
    expect(within(footer).getByRole("status")).toHaveTextContent("—")
    expect(within(footer).getByText("connecting")).toBeVisible()
    expect(within(footer).queryByText(/total/)).toBeNull()
  })
})
