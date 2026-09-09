import type { DeploymentsApi, ListRequest } from "./api"
import type { Checkpoint, Deployment, DeploymentPage } from "./schema"

export type FakeDeploymentsApi = DeploymentsApi & {
  requests: ListRequest[]
  replaceAll: (rows: Deployment[]) => void
}

export const createFakeDeploymentsApi = (initial: Deployment[] = []): FakeDeploymentsApi => {
  let rows = [...initial]
  const requests: ListRequest[] = []
  return {
    requests,
    replaceAll: (next) => {
      rows = [...next]
    },
    list: async (request) => {
      requests.push(request)
      return page(rows, request)
    },
  }
}

const page = (rows: Deployment[], { after, limit }: ListRequest): DeploymentPage => {
  const ordered = [...rows].sort(byCheckpoint)
  const remaining = after ? ordered.filter((row) => byCheckpoint(row, after) > 0) : ordered
  const items = remaining.slice(0, limit)
  const last = items.at(-1)
  const exhausted = remaining.length <= limit || last === undefined
  return {
    items,
    checkpoint: exhausted ? null : { updated_at: last.updated_at, deployment_id: last.deployment_id },
  }
}

const byCheckpoint = (left: Checkpoint, right: Checkpoint): number =>
  left.updated_at === right.updated_at
    ? left.deployment_id.localeCompare(right.deployment_id)
    : Date.parse(left.updated_at) - Date.parse(right.updated_at)
