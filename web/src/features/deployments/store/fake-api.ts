import { ApiError } from "@/lib/api/http"
import type { DeploymentsApi, ListRequest, ReplaceOutcome, ReplaceRequest } from "./api"
import type { Checkpoint, Deployment, DeploymentPage } from "./schema"

const NOT_FOUND = 404
const CONFLICT = 409
const STAMP_STEP_MS = 1000

export type FakeDeploymentsApi = DeploymentsApi & {
  requests: ListRequest[]
  writes: ReplaceRequest[]
  replaceAll: (rows: Deployment[]) => void
  store: (row: Deployment) => void
  rowFor: (id: string) => Deployment | undefined
  holdWrites: () => () => void
}

export const createFakeDeploymentsApi = (initial: Deployment[] = []): FakeDeploymentsApi => {
  let rows = [...initial]
  const requests: ListRequest[] = []
  const writes: ReplaceRequest[] = []
  const put = (row: Deployment) => {
    rows = [...rows.filter((current) => current.deployment_id !== row.deployment_id), row]
  }
  let held: Promise<void> | null = null
  return {
    requests,
    writes,
    replaceAll: (next) => {
      rows = [...next]
    },
    store: put,
    rowFor: (id) => rows.find((row) => row.deployment_id === id),
    holdWrites: () => {
      let release = () => undefined as void
      held = new Promise<void>((resolve) => {
        release = () => {
          held = null
          resolve()
        }
      })
      return release
    },
    list: async (request) => {
      requests.push(request)
      return page(rows, request)
    },
    get: async (id) => {
      const found = rows.find((row) => row.deployment_id === id)
      if (!found) throw new ApiError(NOT_FOUND, "Not Found")
      return found
    },
    replace: async (request) => {
      writes.push(request)
      if (held) await held
      const current = rows.find((row) => row.deployment_id === request.id)
      if (!current) throw new ApiError(NOT_FOUND, "Not Found")
      if (current.deleted_at !== null) throw new ApiError(CONFLICT, "Conflict")
      if (request.expectedRevision !== null && current.revision !== request.expectedRevision) {
        return { outcome: "conflict", deployment: current }
      }
      const written: Deployment = {
        ...current,
        ...request.writable,
        revision: current.revision + 1,
        updated_at: nextStamp(rows),
      }
      put(written)
      return { outcome: "written", deployment: written } satisfies ReplaceOutcome
    },
  }
}

const nextStamp = (rows: Deployment[]): string => {
  const latest = rows.reduce((newest, row) => Math.max(newest, Date.parse(row.updated_at)), 0)
  return new Date(latest + STAMP_STEP_MS).toISOString()
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
