import { createCollection, type Collection } from "@tanstack/react-db"
import { rxdbCollectionOptions } from "@tanstack/rxdb-db-collection"
import {
  addRxPlugin,
  createRxDatabase,
  type RxCollection,
  type RxDatabase,
  type RxReplicationPullStreamItem,
  type RxReplicationWriteToMasterRow,
  type WithDeleted,
} from "rxdb/plugins/core"
import { RxDBMigrationSchemaPlugin } from "rxdb/plugins/migration-schema"
import { getRxStorageDexie } from "rxdb/plugins/storage-dexie"
import { replicateRxCollection, type RxReplicationState } from "rxdb/plugins/replication"
import { Subject } from "rxjs"
import { ApiError } from "@/lib/api/http"
import { createLogger } from "@/lib/logger"
import { PULL_BATCH_SIZE, type DeploymentsApi } from "./api"
import { conflictBetween } from "./conflict"
import { migrationStrategies, rxdbDeploymentSchema } from "./rxdb-schema"
import { deploymentSchema, writableOf, type Checkpoint, type Deployment } from "./schema"
import { createSyncTracker, type SyncStatus, type SyncTracker } from "./sync-tracker"

addRxPlugin(RxDBMigrationSchemaPlugin)

const log = createLogger("deployments", "store")

const DATABASE_NAME = "deployments"
const COLLECTION_NAME = "deployments"
const REPLICATION_IDENTIFIER = "deployments"
const PUSH_BATCH_SIZE = 5
const CLIENT_ERROR_FLOOR = 400
const SERVER_ERROR_FLOOR = 500

type DeploymentsCollection = Collection<Deployment, string, Record<string, never>>

export type DeploymentsStore = {
  collection: DeploymentsCollection
  sync: SyncStatus
  destroy: () => Promise<void>
}

export type StoreOptions = {
  api: DeploymentsApi
  databaseName?: string
  multiInstance?: boolean
  pullBatchSize?: number
}

export const createDeploymentsStore = async ({
  api,
  databaseName = DATABASE_NAME,
  multiInstance = true,
  pullBatchSize = PULL_BATCH_SIZE,
}: StoreOptions): Promise<DeploymentsStore> => {
  const database: RxDatabase = await createRxDatabase({
    name: databaseName,
    storage: getRxStorageDexie(),
    multiInstance,
  })
  const collections = await database.addCollections({
    [COLLECTION_NAME]: { schema: rxdbDeploymentSchema(), migrationStrategies },
  })
  const rxCollection = collections[COLLECTION_NAME] as RxCollection<Deployment>
  const tracker = createSyncTracker()
  const stream$ = new Subject<PullStreamItem>()
  const unsubscribe = api.subscribe({
    onOpen: () => tracker.connectionChanged("live"),
    onError: () => {
      tracker.connectionChanged(navigator.onLine ? "reconnecting" : "offline")
      stream$.next("RESYNC")
    },
    onEvent: (event) => {
      log.debug("streamed {count} changes", { count: event.documents.length })
      stream$.next({
        documents: event.documents.map((document) => ({ ...document, _deleted: false })),
        checkpoint: event.checkpoint,
      })
    },
  })
  const replication = replicate(rxCollection, api, pullBatchSize, tracker, stream$)
  const failures = replication.error$.subscribe((error) => {
    log.warning("replication error: {message}", { message: String(error?.message ?? error) })
    tracker.connectionChanged(navigator.onLine ? "reconnecting" : "offline")
  })
  const collection = createCollection(
    rxdbCollectionOptions({ rxCollection, schema: deploymentSchema }),
  ) as unknown as DeploymentsCollection

  return {
    collection,
    sync: { subscribe: tracker.subscribe, snapshot: tracker.snapshot },
    destroy: async () => {
      unsubscribe()
      failures.unsubscribe()
      stream$.complete()
      await replication.cancel()
      await database.close()
    },
  }
}

type PullStreamItem = RxReplicationPullStreamItem<Deployment, Checkpoint | undefined>

const replicate = (
  rxCollection: RxCollection<Deployment>,
  api: DeploymentsApi,
  pullBatchSize: number,
  tracker: SyncTracker,
  stream$: Subject<PullStreamItem>,
): RxReplicationState<Deployment, Checkpoint | undefined> =>
  replicateRxCollection<Deployment, Checkpoint | undefined>({
    collection: rxCollection,
    replicationIdentifier: REPLICATION_IDENTIFIER,
    live: true,
    push: {
      batchSize: PUSH_BATCH_SIZE,
      handler: async (rows) => {
        const settled = await Promise.all(rows.map((row) => pushRow(row, api, tracker)))
        return settled.filter((row): row is WithDeleted<Deployment> => row !== null)
      },
    },
    pull: {
      stream$: stream$.asObservable(),
      batchSize: pullBatchSize,
      handler: async (lastCheckpoint, batchSize) => {
        const page = await api.list({ after: lastCheckpoint ?? null, limit: batchSize })
        log.debug("pulled {count} deployments", { count: page.items.length })
        return {
          documents: page.items.map((item) => ({ ...item, _deleted: false })),
          checkpoint: page.checkpoint ?? checkpointOf(page.items) ?? lastCheckpoint,
        }
      },
    },
  })

const checkpointOf = (items: Deployment[]): Checkpoint | undefined => {
  const last = items.at(-1)
  return last === undefined ? undefined : { updated_at: last.updated_at, deployment_id: last.deployment_id }
}

const pushRow = async (
  row: RxReplicationWriteToMasterRow<Deployment>,
  api: DeploymentsApi,
  tracker: SyncTracker,
): Promise<WithDeleted<Deployment> | null> => {
  const attempted = row.newDocumentState
  const master = row.assumedMasterState
  if (master === undefined) return null
  tracker.began(attempted.deployment_id)
  try {
    const settled =
      attempted.deleted_at === master.deleted_at
        ? await settleWrite(attempted, master, api)
        : await settleScope(attempted, api)
    if (settled.rejection === null) {
      const conflict = conflictBetween(attempted, settled.winner)
      if (conflict) {
        log.warning("write to {id} lost to a newer version", { id: attempted.deployment_id })
        tracker.conflicted(conflict)
      }
    } else {
      log.warning("write to {id} was rejected: {detail}", {
        id: attempted.deployment_id,
        detail: settled.rejection,
      })
      tracker.rejected({ deployment: settled.winner, detail: settled.rejection })
    }
    return { ...settled.winner, _deleted: false }
  } finally {
    tracker.settled(attempted.deployment_id)
  }
}

type SettledWrite = { winner: Deployment; rejection: string | null }

const settleScope = async (attempted: Deployment, api: DeploymentsApi): Promise<SettledWrite> => {
  try {
    if (attempted.deleted_at === null) return { winner: await api.restore(attempted.deployment_id), rejection: null }
    await api.remove(attempted.deployment_id)
    return { winner: await api.get(attempted.deployment_id), rejection: null }
  } catch (error) {
    if (!rejected(error)) throw error
    return { winner: await api.get(attempted.deployment_id), rejection: error.message }
  }
}

const settleWrite = async (attempted: Deployment, master: Deployment, api: DeploymentsApi): Promise<SettledWrite> => {
  try {
    const result = await api.replace({
      id: attempted.deployment_id,
      writable: writableOf(attempted),
      expectedRevision: master.revision,
    })
    return { winner: result.deployment, rejection: null }
  } catch (error) {
    if (!rejected(error)) throw error
    return { winner: await api.get(attempted.deployment_id), rejection: error.message }
  }
}

const rejected = (error: unknown): error is ApiError =>
  error instanceof ApiError && error.status >= CLIENT_ERROR_FLOOR && error.status < SERVER_ERROR_FLOOR
