import { ApiError } from "@/lib/api/http"
import type { ChangeListeners, DeploymentsApi, ListRequest, ReplaceOutcome, ReplaceRequest } from "./api"
import type { Checkpoint, Deployment, DeploymentPage } from "./schema"

const NOT_FOUND = 404
const CONFLICT = 409
const UNPROCESSABLE = 422
const STAMP_STEP_MS = 1000

export type FakeDeploymentsApi = DeploymentsApi & {
  requests: ListRequest[]
  writes: ReplaceRequest[]
  replaceAll: (rows: Deployment[]) => void
  store: (row: Deployment) => void
  rowFor: (id: string) => Deployment | undefined
  holdWrites: () => () => void
  refuseWrites: (detail: string) => void
  failWrites: (status: number, detail: string) => void
  connect: () => void
  emit: (documents: Deployment[]) => void
  drop: () => void
  subscribers: number
}

export const createFakeDeploymentsApi = (initial: Deployment[] = []): FakeDeploymentsApi => {
  let rows = [...initial]
  const requests: ListRequest[] = []
  const writes: ReplaceRequest[] = []
  const put = (row: Deployment) => {
    rows = [...rows.filter((current) => current.deployment_id !== row.deployment_id), row]
  }
  let held: Promise<void> | null = null
  let refusal: string | null = null
  let writeFailure: { status: number; detail: string } | null = null
  const listeners = new Set<ChangeListeners>()
  return {
    requests,
    writes,
    replaceAll: (next) => {
      rows = [...next]
    },
    store: put,
    rowFor: (id) => rows.find((row) => row.deployment_id === id),
    subscribe: (change) => {
      listeners.add(change)
      return () => listeners.delete(change)
    },
    connect: () => {
      for (const listener of listeners) listener.onOpen()
    },
    drop: () => {
      for (const listener of listeners) listener.onError()
    },
    emit: (documents) => {
      const last = documents.at(-1)
      if (!last) return
      for (const document of documents) put(document)
      for (const listener of listeners) {
        listener.onEvent({
          documents,
          checkpoint: { updated_at: last.updated_at, deployment_id: last.deployment_id },
        })
      }
    },
    get subscribers() {
      return listeners.size
    },
    refuseWrites: (detail) => {
      refusal = detail
    },
    failWrites: (status, detail) => {
      writeFailure = { status, detail }
    },
    holdWrites: () => {
      // oxlint-disable-next-line unicorn/consistent-function-scoping
      let letGo = () => undefined as void
      held = new Promise<void>((resolve) => {
        letGo = () => {
          held = null
          resolve()
        }
      })
      return () => letGo()
    },
    list: (request) => {
      requests.push(request)
      return Promise.resolve(page(rows, request))
    },
    remove: (id) => {
      const current = rows.find((row) => row.deployment_id === id)
      if (!current || current.deleted_at !== null) return Promise.reject(new ApiError(NOT_FOUND, "Not Found"))
      put({ ...current, deleted_at: nextStamp(rows), revision: current.revision + 1, updated_at: nextStamp(rows) })
      return Promise.resolve()
    },
    restore: (id) => {
      const current = rows.find((row) => row.deployment_id === id)
      if (!current) return Promise.reject(new ApiError(NOT_FOUND, "Not Found"))
      if (current.deleted_at === null) return Promise.reject(new ApiError(CONFLICT, "Conflict"))
      const restored = { ...current, deleted_at: null, revision: current.revision + 1, updated_at: nextStamp(rows) }
      put(restored)
      return Promise.resolve(restored)
    },
    get: (id) => {
      const found = rows.find((row) => row.deployment_id === id)
      if (!found) return Promise.reject(new ApiError(NOT_FOUND, "Not Found"))
      return Promise.resolve(found)
    },
    replace: async (request) => {
      writes.push(request)
      if (held) await held
      const current = rows.find((row) => row.deployment_id === request.id)
      if (!current) throw new ApiError(NOT_FOUND, "Not Found")
      if (writeFailure !== null) throw new ApiError(writeFailure.status, "Write Failed", writeFailure.detail)
      if (refusal !== null) throw new ApiError(UNPROCESSABLE, "Unprocessable Content", refusal)
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
  const ordered = rows.toSorted(byCheckpoint)
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
