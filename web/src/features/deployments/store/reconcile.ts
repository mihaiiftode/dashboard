import type { DeploymentsApi } from "./api"
import { PULL_BATCH_SIZE } from "./api"
import type { Deployment } from "./schema"
import type { RxCollection, WithDeleted } from "./rxdb"

export type Reconciliation = { examined: number; missing: WithDeleted<Deployment>[] }

export const purgedDocuments = async (
  collection: RxCollection<Deployment>,
  api: DeploymentsApi,
): Promise<Reconciliation> => {
  const cached = await collection.find().exec()
  const batches: (typeof cached)[] = []
  for (let offset = 0; offset < cached.length; offset += PULL_BATCH_SIZE) {
    batches.push(cached.slice(offset, offset + PULL_BATCH_SIZE))
  }
  const absent = await Promise.all(
    batches.map(async (batch) => new Set(await api.missingIds(batch.map((document) => document.primary)))),
  )
  const missing: WithDeleted<Deployment>[] = []
  batches.forEach((batch, index) => {
    for (const document of batch) {
      if (absent[index].has(document.primary)) missing.push({ ...document.toJSON(), _deleted: true })
    }
  })
  return { examined: cached.length, missing }
}
