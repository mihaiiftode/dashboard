import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { setupUser } from "@/test/user"
import { AppShell } from "./app-shell"

describe("AppShell", () => {
  it("renders skip link, header brand, main with children, and footer placeholders", () => {
    render(
      <AppShell>
        <p>page body</p>
      </AppShell>,
    )
    const main = screen.getByRole("main")
    expect(screen.getByRole("link", { name: "Skip to content" }).getAttribute("href")).toBe(`#${main.id}`)
    expect(within(screen.getByRole("banner")).getByRole("link", { name: "Deployments" })).toBeVisible()
    expect(within(main).getByText("page body")).toBeVisible()
    const footer = screen.getByRole("contentinfo")
    expect(within(footer).getByRole("status", { name: "Matched deployments" })).toHaveTextContent("—")
    expect(within(footer).getByText("connecting")).toBeVisible()
  })

  it("reaches the skip link, brand, and theme toggle in that order by keyboard", async () => {
    const user = setupUser()
    render(<AppShell>{null}</AppShell>)
    await user.tab()
    expect(screen.getByRole("link", { name: "Skip to content" })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole("link", { name: "Deployments" })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole("button", { name: "Toggle theme" })).toHaveFocus()
  })
})
