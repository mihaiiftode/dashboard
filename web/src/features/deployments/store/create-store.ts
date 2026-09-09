import { createCollection, type Collection } from "@tanstack/react-db"
import { rxdbCollectionOptions } from "@tanstack/rxdb-db-collection"
import { createRxDatabase, type RxCollection, type RxDatabase } from "rxdb/plugins/core"
import { getRxStorageDexie } from "rxdb/plugins/storage-dexie"
import { replicateRxCollection, type RxReplicationState } from "rxdb/plugins/replication"
import { createLogger } from "@/lib/logger"
import { PULL_BATCH_SIZE, type DeploymentsApi } from "./api"
import { rxdbDeploymentSchema } from "./rxdb-schema"
import { deploymentSchema, type Checkpoint, type Deployment } from "./schema"

const log = createLogger("deployments", "store")

export const DATABASE_NAME = "deployments"
export const COLLECTION_NAME = "deployments"
const REPLICATION_IDENTIFIER = "deployments-pull"

export type DeploymentsCollection = Collection<Deployment, string, Record<string, never>>

export type DeploymentsStore = {
  collection: DeploymentsCollection
  whenFirstPullSettles: () => Promise<void>
  whenInSync: () => Promise<void>
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
    [COLLECTION_NAME]: { schema: rxdbDeploymentSchema() },
  })
  const rxCollection = collections[COLLECTION_NAME] as RxCollection<Deployment>
  const replication = pullReplication(rxCollection, api, pullBatchSize)
  const collection = createCollection(
    rxdbCollectionOptions({ rxCollection, schema: deploymentSchema }),
  ) as unknown as DeploymentsCollection

  return {
    collection,
    whenFirstPullSettles: async () => {
      await replication.awaitInitialReplication()
    },
    whenInSync: async () => {
      await replication.awaitInSync()
    },
    destroy: async () => {
      await replication.cancel()
      await database.close()
    },
  }
}

const pullReplication = (
  rxCollection: RxCollection<Deployment>,
  api: DeploymentsApi,
  pullBatchSize: number,
): RxReplicationState<Deployment, Checkpoint | undefined> =>
  replicateRxCollection<Deployment, Checkpoint | undefined>({
    collection: rxCollection,
    replicationIdentifier: REPLICATION_IDENTIFIER,
    live: true,
    pull: {
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
