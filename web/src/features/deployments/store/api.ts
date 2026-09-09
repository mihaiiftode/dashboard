import { requestJson, type Fetcher } from "@/lib/api/http"
import { deploymentPageSchema, type Checkpoint, type DeploymentPage } from "./schema"

export const PULL_BATCH_SIZE = 1000

export type ListRequest = {
  after: Checkpoint | null
  limit: number
}

export type DeploymentsApi = {
  list: (request: ListRequest) => Promise<DeploymentPage>
}

export const createFetchDeploymentsApi = (baseUrl: string, fetcher: Fetcher = globalThis.fetch): DeploymentsApi => ({
  list: ({ after, limit }) => requestJson(fetcher, listUrl(baseUrl, after, limit), deploymentPageSchema),
})

const listUrl = (baseUrl: string, after: Checkpoint | null, limit: number): string => {
  const url = new URL("/v1/deployments", baseUrl)
  url.searchParams.set("limit", String(limit))
  if (after) {
    url.searchParams.set("updated_after", after.updated_at)
    url.searchParams.set("after_id", after.deployment_id)
  }
  return url.toString()
}
