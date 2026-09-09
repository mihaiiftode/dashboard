"use client"

import { useQueryState } from "nuqs"
import { DeploymentsPageClient, queryParser } from "@/features/deployments/main"

export const DeploymentsRoute = () => {
  const [query, setQuery] = useQueryState("q", queryParser)
  return <DeploymentsPageClient query={query} onQueryChange={setQuery} />
}
