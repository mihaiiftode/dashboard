import { ApiError, requestJson, type Fetcher } from "@/lib/api/http"
import {
  deploymentPageSchema,
  deploymentSchema,
  type Checkpoint,
  type Deployment,
  type DeploymentPage,
  type WritableDeployment,
} from "./schema"

export const PULL_BATCH_SIZE = 1000
const PRECONDITION_FAILED = 412

export type ListRequest = {
  after: Checkpoint | null
  limit: number
}

export type ReplaceRequest = {
  id: string
  writable: WritableDeployment
  expectedRevision: number | null
}

export type ReplaceOutcome = {
  outcome: "written" | "conflict"
  deployment: Deployment
}

export type DeploymentsApi = {
  list: (request: ListRequest) => Promise<DeploymentPage>
  get: (id: string) => Promise<Deployment>
  replace: (request: ReplaceRequest) => Promise<ReplaceOutcome>
}

export const createFetchDeploymentsApi = (baseUrl: string, fetcher: Fetcher = globalThis.fetch): DeploymentsApi => ({
  list: ({ after, limit }) => requestJson(fetcher, listUrl(baseUrl, after, limit), deploymentPageSchema),
  get: (id) => requestJson(fetcher, oneUrl(baseUrl, id), deploymentSchema),
  replace: async ({ id, writable, expectedRevision }) => {
    try {
      const deployment = await requestJson(fetcher, oneUrl(baseUrl, id), deploymentSchema, {
        method: "PUT",
        headers: { "content-type": "application/json", ...ifMatch(expectedRevision) },
        body: JSON.stringify(writable),
      })
      return { outcome: "written", deployment }
    } catch (error) {
      if (error instanceof ApiError && error.status === PRECONDITION_FAILED) {
        return { outcome: "conflict", deployment: deploymentSchema.parse(error.body) }
      }
      throw error
    }
  },
})

const ifMatch = (revision: number | null): Record<string, string> =>
  revision === null ? {} : { "if-match": `"${revision}"` }

const oneUrl = (baseUrl: string, id: string): string => new URL(`/v1/deployments/${id}`, baseUrl).toString()

const listUrl = (baseUrl: string, after: Checkpoint | null, limit: number): string => {
  const url = new URL("/v1/deployments", baseUrl)
  url.searchParams.set("limit", String(limit))
  if (after) {
    url.searchParams.set("updated_after", after.updated_at)
    url.searchParams.set("after_id", after.deployment_id)
  }
  return url.toString()
}
