"use client"

import { useQueryState } from "nuqs"
import { DeploymentsPageClient } from "@/features/deployments/pages/deployments-page-client"
import { groupParser, queryParser, sortParser } from "@/features/deployments/url"
import type { DeploymentsSeed } from "@/features/deployments/store/seed"

export const DeploymentsRoute = ({ seed }: { seed: DeploymentsSeed }) => {
  const [query, setQuery] = useQueryState("q", queryParser)
  const [group, setGroup] = useQueryState("group", groupParser)
  const [sort, setSort] = useQueryState("sort", sortParser)
  return (
    <DeploymentsPageClient
      seed={seed}
      query={query}
      onQueryChange={setQuery}
      group={group}
      onGroupChange={setGroup}
      sort={sort}
      onSortChange={setSort}
    />
  )
}
