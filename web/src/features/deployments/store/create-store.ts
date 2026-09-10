import { createCollection, type Collection } from "@tanstack/react-db"
import { rxdbCollectionOptions } from "@tanstack/rxdb-db-collection"
import {
  RxDBMigrationSchemaPlugin,
  addRxPlugin,
  createRxDatabase,
  getRxStorageDexie,
  replicateRxCollection,
  type RxCollection,
  type RxDatabase,
  type RxReplicationPullStreamItem,
  type RxReplicationState,
  type WithDeleted,
} from "./rxdb"
import { Subject, type Subscription } from "rxjs"
import { createLogger } from "@/lib/logger"
import { PULL_BATCH_SIZE, type DeploymentsApi } from "./api"
import { migrationStrategies, rxdbDeploymentSchema } from "./rxdb-schema"
import { deploymentSchema, type Checkpoint, type Deployment } from "./schema"
import { createSyncTracker, type SyncStatus, type SyncTracker } from "./sync-tracker"
import { pushRow } from "./replication-writes"
import { purgedDocuments } from "./reconcile"

addRxPlugin(RxDBMigrationSchemaPlugin)

const log = createLogger("deployments", "store")

const DATABASE_NAME = "deployments"
const COLLECTION_NAME = "deployments"
const REPLICATION_IDENTIFIER = "deployments"
const PUSH_BATCH_SIZE = 5

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

type Acquired = {
  database?: RxDatabase
  unsubscribe?: () => void
  stream$?: Subject<PullStreamItem>
  replication?: RxReplicationState<Deployment, Checkpoint | undefined>
  failures?: Subscription
  collection?: DeploymentsCollection
}

const release = async (acquired: Acquired): Promise<void> => {
  const steps: [string, () => unknown][] = [
    ["event stream", () => acquired.unsubscribe?.()],
    ["replication errors", () => acquired.failures?.unsubscribe()],
    ["pull stream", () => acquired.stream$?.complete()],
    ["replication", () => acquired.replication?.cancel()],
    ["collection", () => acquired.collection?.cleanup()],
    ["database", () => acquired.database?.close()],
  ]
  for (const [name, step] of steps) {
    try {
      // eslint-disable-next-line no-await-in-loop -- teardown order is deliberate
      await step()
    } catch (error) {
      log.warning("releasing the {name} failed: {message}", { name, message: String(error) })
    }
  }
  for (const key of Object.keys(acquired)) delete acquired[key as keyof Acquired]
}

export const createDeploymentsStore = async ({
  api,
  databaseName = DATABASE_NAME,
  multiInstance = true,
  pullBatchSize = PULL_BATCH_SIZE,
}: StoreOptions): Promise<DeploymentsStore> => {
  const acquired: Acquired = {}
  const tracker = createSyncTracker()
  try {
    const database: RxDatabase = await createRxDatabase({
      name: databaseName,
      storage: getRxStorageDexie(),
      multiInstance,
    })
    acquired.database = database
    const collections = await database.addCollections({
      [COLLECTION_NAME]: { schema: rxdbDeploymentSchema(), migrationStrategies },
    })
    const rxCollection = collections[COLLECTION_NAME] as RxCollection<Deployment>
    const stream$ = new Subject<PullStreamItem>()
    acquired.stream$ = stream$
    const recovery = { required: true }
    const replication = replicate(rxCollection, api, pullBatchSize, tracker, stream$, recovery)
    acquired.replication = replication
    acquired.unsubscribe = api.subscribe({
      onOpen: () => {
        recovery.required = true
        tracker.connectionChanged("live")
        stream$.next("RESYNC")
      },
      onResync: () => stream$.next("RESYNC"),
      onError: () => {
        tracker.connectionChanged(navigator.onLine ? "reconnecting" : "offline")
        stream$.next("RESYNC")
      },
      onEvent: (event) => {
        log.debug("streamed {count} changes", { count: event.documents.length })
        stream$.next("RESYNC")
      },
    })
    acquired.failures = replication.error$.subscribe((error) => {
      log.warning("replication error: {message}", { message: String(error?.message ?? error) })
      tracker.connectionChanged(navigator.onLine ? "reconnecting" : "offline")
    })
    const options = rxdbCollectionOptions({ rxCollection, schema: deploymentSchema })
    const collection = createCollection({
      ...options,
      onUpdate: async (params) => {
        for (const mutation of params.transaction.mutations) tracker.queued(mutation.modified)
        try {
          await options.onUpdate?.(params)
        } catch (error) {
          for (const mutation of params.transaction.mutations)
            tracker.settled(mutation.modified.deployment_id, mutation.modified)
          throw error
        }
      },
    }) as unknown as DeploymentsCollection
    acquired.collection = collection

    return {
      collection,
      sync: { subscribe: tracker.subscribe, snapshot: tracker.snapshot },
      destroy: () => release(acquired),
    }
  } catch (error) {
    await release(acquired)
    throw error
  }
}

type PullStreamItem = RxReplicationPullStreamItem<Deployment, Checkpoint | undefined>

const replicate = (
  rxCollection: RxCollection<Deployment>,
  api: DeploymentsApi,
  pullBatchSize: number,
  tracker: SyncTracker,
  stream$: Subject<PullStreamItem>,
  recovery: { required: boolean },
): RxReplicationState<Deployment, Checkpoint | undefined> => {
  const acknowledged = new Map<string, Deployment>()
  return replicateRxCollection<Deployment, Checkpoint | undefined>({
    collection: rxCollection,
    replicationIdentifier: REPLICATION_IDENTIFIER,
    live: true,
    push: {
      batchSize: PUSH_BATCH_SIZE,
      handler: async (rows) => {
        const settled = await Promise.all(rows.map((row) => pushRow(row, api, tracker, acknowledged)))
        return settled.filter((row): row is WithDeleted<Deployment> => row !== null)
      },
    },
    pull: {
      stream$: stream$.asObservable(),
      batchSize: pullBatchSize,
      handler: async (lastCheckpoint, batchSize) => {
        const page = await api.list({ after: lastCheckpoint ?? null, limit: batchSize })
        let purged: WithDeleted<Deployment>[] = []
        if (recovery.required && page.items.length < batchSize) {
          recovery.required = false
          try {
            purged = await purgedDocuments(rxCollection, api)
          } catch (error) {
            recovery.required = true
            throw error
          }
        }
        log.debug("pulled {count} deployments", { count: page.items.length })
        return {
          documents: [...page.items.map((item) => ({ ...item, _deleted: false })), ...purged],
          checkpoint: page.checkpoint ?? checkpointOf(page.items) ?? lastCheckpoint,
        }
      },
    },
  })
}

const checkpointOf = (items: Deployment[]): Checkpoint | undefined => {
  const last = items.at(-1)
  return last === undefined ? undefined : { updated_at: last.updated_at, deployment_id: last.deployment_id }
}
