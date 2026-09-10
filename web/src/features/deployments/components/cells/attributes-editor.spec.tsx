import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { deployment } from "@/test/deployments"
import { setupUser } from "@/test/user"
import { AttributesEditor } from "./attributes-editor"

const KEYS = ["name", "team", "oncall", "cost_centre"]

const openEditor = (overrides: Parameters<typeof deployment>[1] = {}) => {
  const onCommit = vi.fn<(key: string, value: string) => void>()
  const row = deployment(1, overrides)
  render(<AttributesEditor deployment={row} keys={KEYS} onCommit={onCommit} />)
  return { user: setupUser(), onCommit, row }
}

describe("AttributesEditor", () => {
  it("saves a new key with its value", async () => {
    const { user, onCommit } = openEditor()

    await user.type(screen.getByRole("textbox", { name: "New attribute key" }), "cost_centre")
    await user.type(screen.getByRole("textbox", { name: "New attribute value" }), "cc-42")
    await user.click(screen.getByRole("button", { name: "Add attribute" }))

    expect(onCommit).toHaveBeenCalledWith("cost_centre", "cc-42")
  })

  it("updates a key the deployment already carries", async () => {
    const { user, onCommit } = openEditor({ attributes: { team: "payments" } })

    const field = screen.getByLabelText("team")
    await user.clear(field)
    await user.type(field, "search{Enter}")

    expect(onCommit).toHaveBeenCalledWith("team", "search")
  })

  it("removes a key", async () => {
    const { user, onCommit } = openEditor({ attributes: { team: "payments" } })

    await user.click(screen.getByRole("button", { name: "Remove team" }))

    expect(onCommit).toHaveBeenCalledWith("team", "")
  })

  it("never offers to remove the name", () => {
    openEditor({ attributes: { team: "payments" } })

    expect(screen.getByLabelText("name")).toBeVisible()
    expect(screen.queryByRole("button", { name: "Remove name" })).toBeNull()
  })

  it("explains a key the rules do not allow instead of saving it", async () => {
    const { user, onCommit } = openEditor()

    await user.type(screen.getByRole("textbox", { name: "New attribute key" }), "bad key")
    await user.type(screen.getByRole("textbox", { name: "New attribute value" }), "value")
    await user.click(screen.getByRole("button", { name: "Add attribute" }))

    expect(screen.getByText(/must be 1 to 64 characters of a-z, 0-9, underscore or hyphen/u)).toBeVisible()
    expect(onCommit).not.toHaveBeenCalled()
  })

  it("explains a blank value instead of saving it", async () => {
    const { user, onCommit } = openEditor({ attributes: { team: "payments" } })

    const field = screen.getByLabelText("team")
    await user.clear(field)
    await user.tab()

    expect(screen.getByText("team must not be blank")).toBeVisible()
    expect(onCommit).not.toHaveBeenCalled()
  })

  it("explains a value over the length limit instead of saving it", async () => {
    const { user, onCommit } = openEditor({ attributes: { team: "payments" } })

    const field = screen.getByLabelText("team")
    await user.clear(field)
    await user.paste("x".repeat(513))
    await user.tab()

    expect(screen.getByText("team must be at most 512 characters")).toBeVisible()
    expect(onCommit).not.toHaveBeenCalled()
  })

  it("explains an oncall address that is not an email instead of saving it", async () => {
    const { user, onCommit } = openEditor({ attributes: { oncall: "on@example.com" } })

    const field = screen.getByLabelText("oncall")
    await user.clear(field)
    await user.type(field, "not-an-email{Enter}")

    expect(screen.getByText("oncall must be an email address")).toBeVisible()
    expect(onCommit).not.toHaveBeenCalled()
  })
})

describe("multiple editors mounted together", () => {
  it("gives each editor its own field identity", () => {
    const first = deployment(1, { attributes: { team: "payments" } })
    const second = deployment(2, { attributes: { team: "search" } })
    render(
      <>
        <AttributesEditor deployment={first} keys={KEYS} onCommit={vi.fn<(key: string, value: string) => void>()} />
        <AttributesEditor deployment={second} keys={KEYS} onCommit={vi.fn<(key: string, value: string) => void>()} />
      </>,
    )

    const labelled = screen.getAllByLabelText("team")
    const ids = labelled.map((field) => field.id)

    expect(labelled).toHaveLength(2)
    expect(new Set(ids).size).toBe(2)
    expect((labelled[0] as HTMLInputElement).value).toBe("payments")
    expect((labelled[1] as HTMLInputElement).value).toBe("search")
  })
})
