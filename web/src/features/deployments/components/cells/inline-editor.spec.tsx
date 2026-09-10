import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { setupUser } from "@/test/user"
import { InlineEditor } from "./inline-editor"

const openEditor = (options?: Parameters<typeof InlineEditor>[0]["options"]) => {
  const onCommit = vi.fn<(next: string) => void>()
  const onCancel = vi.fn<() => void>()
  render(<InlineEditor value="payments" options={options} onCommit={onCommit} onCancel={onCancel} />)
  return { user: setupUser(), onCommit, onCancel, field: screen.getByLabelText("Edit value") }
}

describe("InlineEditor", () => {
  it("commits the trimmed draft on Enter", async () => {
    const { user, onCommit, onCancel, field } = openEditor()

    await user.clear(field)
    await user.type(field, "  search  {Enter}")

    expect(onCommit).toHaveBeenCalledWith("search")
    expect(onCancel).not.toHaveBeenCalled()
  })

  it("cancels on Escape without committing the draft", async () => {
    const { user, onCommit, onCancel, field } = openEditor()

    await user.clear(field)
    await user.type(field, "search{Escape}")

    expect(onCancel).toHaveBeenCalled()
    expect(onCommit).not.toHaveBeenCalledWith("search")
  })

  it("commits when focus leaves the field", async () => {
    const { user, onCommit, field } = openEditor()

    await user.clear(field)
    await user.type(field, "search")
    await user.tab()

    expect(onCommit).toHaveBeenCalledWith("search")
  })

  it("commits the option a user presses", async () => {
    const { user, onCommit } = openEditor([
      { value: "payments", count: 4 },
      { value: "search", count: 2 },
    ])

    await user.click(await screen.findByRole("option", { name: /search/u }))

    expect(onCommit).toHaveBeenCalledWith("search")
  })
})
