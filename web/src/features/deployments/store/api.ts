import { ApiError, requestJson, requestVoid, type Fetcher } from "@/lib/api/http"
import {
  changeEventSchema,
  deploymentPageSchema,
  deploymentSchema,
  type ChangeEvent,
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

export type ChangeListeners = {
  onEvent: (event: ChangeEvent) => void
  onOpen: () => void
  onError: () => void
}

export type DeploymentsApi = {
  list: (request: ListRequest) => Promise<DeploymentPage>
  get: (id: string) => Promise<Deployment>
  replace: (request: ReplaceRequest) => Promise<ReplaceOutcome>
  remove: (id: string) => Promise<void>
  restore: (id: string) => Promise<Deployment>
  subscribe: (listeners: ChangeListeners) => () => void
}

export const createFetchDeploymentsApi = (baseUrl: string, fetcher: Fetcher = globalThis.fetch): DeploymentsApi => ({
  list: ({ after, limit }) => requestJson(fetcher, listUrl(baseUrl, after, limit), deploymentPageSchema),
  get: (id) => requestJson(fetcher, oneUrl(baseUrl, id), deploymentSchema),
  remove: (id) => requestVoid(fetcher, oneUrl(baseUrl, id), { method: "DELETE" }),
  restore: (id) => requestJson(fetcher, `${oneUrl(baseUrl, id)}/restore`, deploymentSchema, { method: "POST" }),
  subscribe: subscribeWithEventSource(baseUrl),
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

const subscribeWithEventSource =
  (baseUrl: string) =>
  ({ onEvent, onOpen, onError }: ChangeListeners) => {
    const source = new EventSource(eventsUrl(baseUrl))
    source.addEventListener("open", () => onOpen())
    source.addEventListener("error", () => onError())
    source.addEventListener("message", (message: MessageEvent<string>) => {
      const parsed = changeEventSchema.safeParse(JSON.parse(message.data))
      if (parsed.success) onEvent(parsed.data)
    })
    return () => source.close()
  }

const eventsUrl = (baseUrl: string): string => new URL("/v1/deployments/events", baseUrl).toString()

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
