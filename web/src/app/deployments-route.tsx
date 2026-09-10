"use client"

import { useQueryState } from "nuqs"
import { DeploymentsPageClient, groupParser, queryParser, sortParser } from "@/features/deployments/main"

export const DeploymentsRoute = () => {
  const [query, setQuery] = useQueryState("q", queryParser)
  const [group, setGroup] = useQueryState("group", groupParser)
  const [sort, setSort] = useQueryState("sort", sortParser)
  return (
    <DeploymentsPageClient
      query={query}
      onQueryChange={setQuery}
      group={group}
      onGroupChange={setGroup}
      sort={sort}
      onSortChange={setSort}
    />
  )
}
