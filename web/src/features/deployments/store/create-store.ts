import { createCollection, type Collection, type UtilsRecord } from "@tanstack/react-db"
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
import { COLLECTION_ID } from "./collection-id"
import { PLANTED_COOKIE } from "./seed"
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
const RECONCILE_EVERY_MS = 300_000
const PLANTED_COOKIE_SECONDS = 2_592_000

type DeploymentsCollection = Collection<Deployment, string, UtilsRecord>

export type DeploymentsStore = {
  collection: DeploymentsCollection
  sync: SyncStatus
  destroy: () => Promise<void>
}

export type StoreSeed = { rows: readonly Deployment[]; checkpoint: Checkpoint | null }

export type StoreOptions = {
  api: DeploymentsApi
  databaseName?: string
  multiInstance?: boolean
  pullBatchSize?: number
  seed?: StoreSeed
}

type Acquired = {
  database?: RxDatabase
  unsubscribe?: () => void
  stream$?: Subject<PullStreamItem>
  replication?: RxReplicationState<Deployment, Checkpoint | undefined>
  failures?: Subscription
  idle?: Subscription
  collection?: DeploymentsCollection
}

const release = async (acquired: Acquired): Promise<void> => {
  const steps: [string, () => unknown][] = [
    ["event stream", () => acquired.unsubscribe?.()],
    ["replication errors", () => acquired.failures?.unsubscribe()],
    ["idle watch", () => acquired.idle?.unsubscribe()],
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
  seed,
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
    const pulled: Pulled = { reconciledAt: 0, checkpoint: undefined, sown: false }
    const replication = replicate(rxCollection, api, pullBatchSize, tracker, stream$, pulled, seed)
    acquired.replication = replication
    acquired.unsubscribe = api.subscribe({
      onOpen: () => {
        tracker.connectionChanged("live")
        stream$.next("RESYNC")
      },
      onChanged: () => stream$.next("RESYNC"),
      onError: () => {
        tracker.connectionChanged(navigator.onLine ? "reconnecting" : "offline")
        stream$.next("RESYNC")
      },
    })
    acquired.idle = replication.active$.subscribe((active) => {
      if (!active) tracker.idled()
    })
    acquired.failures = replication.error$.subscribe((error) => {
      log.warning("replication error: {message}", { message: String(error?.message ?? error) })
      tracker.connectionChanged(navigator.onLine ? "reconnecting" : "offline")
    })
    const options = rxdbCollectionOptions({ rxCollection, schema: deploymentSchema })
    const collection = createCollection({
      ...options,
      id: COLLECTION_ID,
      onUpdate: async (params) => {
        for (const mutation of params.transaction.mutations) tracker.queued(mutation.modified)
        try {
          await options.onUpdate?.(params)
        } catch (error) {
          for (const mutation of params.transaction.mutations)
            tracker.supersededBeforeSettling(mutation.modified.deployment_id, mutation.modified)
          throw error
        }
      },
    })
    acquired.collection = collection
    if ((await rxCollection.count().exec()) > 0) rememberLocalRows()

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

type Pulled = { reconciledAt: number; checkpoint: Checkpoint | undefined; sown: boolean }

const replicate = (
  rxCollection: RxCollection<Deployment>,
  api: DeploymentsApi,
  pullBatchSize: number,
  tracker: SyncTracker,
  stream$: Subject<PullStreamItem>,
  pulled: Pulled,
  seed: StoreSeed | undefined,
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
        const sown = sow(seed, lastCheckpoint, pulled, stream$)
        if (sown) return sown
        const page = await api.list({ after: lastCheckpoint ?? null, limit: batchSize })
        let purged: WithDeleted<Deployment>[] = []
        if (page.items.length < batchSize && Date.now() - pulled.reconciledAt >= RECONCILE_EVERY_MS) {
          const reconciled = await purgedDocuments(rxCollection, api)
          if (reconciled.examined > 0) pulled.reconciledAt = Date.now()
          purged = reconciled.missing
        }
        log.debug("pulled {count} deployments", { count: page.items.length })
        pulled.checkpoint = page.checkpoint ?? checkpointOf(page.items) ?? lastCheckpoint
        const documents: WithDeleted<Deployment>[] = []
        for (const item of page.items) documents.push({ ...item, _deleted: false })
        documents.push(...purged)
        return { documents, checkpoint: pulled.checkpoint }
      },
    },
  })
}

const sow = (
  seed: StoreSeed | undefined,
  lastCheckpoint: Checkpoint | undefined,
  pulled: Pulled,
  stream$: Subject<PullStreamItem>,
): { documents: WithDeleted<Deployment>[]; checkpoint: Checkpoint } | null => {
  if (pulled.sown || lastCheckpoint !== undefined) return null
  if (!seed || seed.rows.length === 0 || seed.checkpoint === null) return null
  pulled.sown = true
  pulled.checkpoint = seed.checkpoint
  log.debug("sowed {count} seeded deployments", { count: seed.rows.length })
  rememberLocalRows()
  queueMicrotask(() => stream$.next("RESYNC"))
  return {
    documents: seed.rows.map((row) => ({ ...row, _deleted: false })),
    checkpoint: seed.checkpoint,
  }
}

const rememberLocalRows = (): void => {
  document.cookie = `${PLANTED_COOKIE}=1; path=/; max-age=${PLANTED_COOKIE_SECONDS}; samesite=lax`
}

const checkpointOf = (items: Deployment[]): Checkpoint | undefined => {
  const last = items.at(-1)
  return last === undefined ? undefined : { updated_at: last.updated_at, deployment_id: last.deployment_id }
}
