import { screen, within } from "@testing-library/react"
import { useState } from "react"
import { describe, expect, it } from "vitest"
import { renderWithProviders } from "@/test/render"
import { replaceSpan } from "../query/query-edits"
import { deployments } from "@/test/deployments"
import { setupUser } from "@/test/user"
import { parseQuery } from "../query/parse-query"
import { buildSchema } from "../query/schema"
import { suggest } from "../query/suggest"
import { EMPTY_VALUE_INDEX, valueIndexOf, type ValueIndex } from "../query/value-index"
import { QueryBar } from "./query-bar"

const { catalog, statistics } = buildSchema(deployments(12))

const indexOf = (entries: Record<string, number>): ValueIndex =>
  valueIndexOf(Object.entries(entries).map(([value, rows]) => ({ value, rows })))

const STATUS_INDEX = indexOf({ active: 7, failed: 3 })

type HarnessProps = { initial?: string; index?: ValueIndex }

const Harness = ({ initial = "", index = EMPTY_VALUE_INDEX }: HarnessProps) => {
  const [query, setQuery] = useState(initial)
  const [caret, setCaret] = useState(initial.length)
  const suggestions = suggest(parseQuery(query, catalog), caret, catalog, {
    index,
    deletedRows: 4,
    attributeCounts: statistics.attributeCounts,
  })
  return (
    <QueryBar
      inputId="search"
      query={query}
      suggestions={suggestions}
      onQueryChange={setQuery}
      onCaretChange={setCaret}
      onSuggestionSelect={(insert) => {
        const next = replaceSpan(query, suggestions.span, insert)
        setQuery(next.query)
        return next.caret
      }}
    />
  )
}

const renderBar = (props: HarnessProps = {}) => renderWithProviders(<Harness {...props} />)

const searchBox = () => screen.getByRole("combobox", { name: /search and filter/iu })

describe("QueryBar", () => {
  it("shows the number of rows behind a suggested value", async () => {
    const user = setupUser()
    renderBar({ index: STATUS_INDEX })

    await user.click(searchBox())
    await user.type(searchBox(), "status:")

    const option = await screen.findByRole("option", { name: /status:active/u })
    expect(within(option).getByText("7")).toBeVisible()
  })

  it("replaces the token under the caret with the chosen suggestion", async () => {
    const user = setupUser()
    renderBar({ index: STATUS_INDEX })

    await user.click(searchBox())
    await user.type(searchBox(), "status:fai")
    await user.click(await screen.findByRole("option", { name: /status:failed/u }))

    expect(searchBox()).toHaveValue("status:failed ")
  })

  it("keeps the typed text and closes the list when Enter arrives with nothing highlighted", async () => {
    const user = setupUser()
    renderBar({ index: indexOf({ "payments-api": 2 }) })

    await user.click(searchBox())
    await user.type(searchBox(), "name:pay")
    expect(await screen.findByRole("option", { name: /matches anywhere/u })).toBeVisible()
    await user.keyboard("{Enter}")

    expect(searchBox()).toHaveValue("name:pay")
    expect(screen.queryByRole("listbox")).toBeNull()
  })

  it("inserts the suggestion the arrow keys highlight", async () => {
    const user = setupUser()
    renderBar({ index: STATUS_INDEX })

    await user.click(searchBox())
    await user.type(searchBox(), "status:")
    await screen.findByRole("option", { name: /status:active/u })
    await user.keyboard("{ArrowDown}{Enter}")

    expect(searchBox()).toHaveValue("status:failed ")
  })

  it("closes the list on Escape and keeps the query", async () => {
    const user = setupUser()
    renderBar({ index: STATUS_INDEX })

    await user.click(searchBox())
    await user.type(searchBox(), "status:")
    await screen.findByRole("option", { name: /status:active/u })
    await user.keyboard("{Escape}")

    expect(screen.queryByRole("listbox")).toBeNull()
    expect(searchBox()).toHaveValue("status:")
  })

  it("leaves the text alone when a key and its colon are typed by hand", async () => {
    const user = setupUser()
    renderBar({ index: STATUS_INDEX })

    await user.click(searchBox())
    await user.type(searchBox(), "status:")

    expect(searchBox()).toHaveValue("status:")
  })
})
