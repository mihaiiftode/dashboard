import { screen, waitFor, within } from "@testing-library/react"
import { useState } from "react"
import { expect } from "vitest"
import { StatusFooter } from "@/components/shell/footer-status"
import { DeploymentsPage } from "@/features/deployments/pages/deployments-page"
import { DEFAULT_SORT, type Sorting } from "@/features/deployments/query/sort"
import { renderWithProviders, type ProviderOptions } from "./render"

const HYDRATE_MS = 5000

type PageState = { query?: string; group?: string | null; sort?: Sorting }

export type PageOptions = ProviderOptions & PageState & { footer?: boolean }

export const renderDeploymentsPage = ({ query, group, sort, footer, ...options }: PageOptions = {}) =>
  renderWithProviders(
    <>
      <DeploymentsPageHarness query={query} group={group} sort={sort} />
      {footer ? <StatusFooter /> : null}
    </>,
    options,
  )

const DeploymentsPageHarness = ({ query: startQuery, group: startGroup, sort: startSort }: PageState) => {
  const [query, onQueryChange] = useState(startQuery ?? "")
  const [group, onGroupChange] = useState(startGroup ?? null)
  const [sort, onSortChange] = useState(startSort ?? DEFAULT_SORT)
  return (
    <DeploymentsPage
      query={query}
      onQueryChange={onQueryChange}
      group={group}
      onGroupChange={onGroupChange}
      sort={sort}
      onSortChange={onSortChange}
    />
  )
}

export const openDeploymentsPage = async (options: PageOptions = {}) => {
  const rendered = renderDeploymentsPage(options)
  return { table: await findTable(), ...rendered }
}

export const findTable = () => screen.findByRole("table", undefined, { timeout: HYDRATE_MS })

export const table = () => screen.getByRole("table")

export const rowNamed = (name: string) => waitFor(() => within(table()).getByText(name))

export const noRowNamed = (name: string) => waitFor(() => expect(within(table()).queryByText(name)).toBeNull())

export const columnHeader = (name: string) =>
  within(table())
    .getAllByRole("columnheader")
    .find((cell) => cell.textContent?.trim() === name)
