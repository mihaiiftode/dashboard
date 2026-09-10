import type { DeploymentsApi } from "./api"
import { PULL_BATCH_SIZE } from "./api"
import type { Deployment } from "./schema"
import type { RxCollection, WithDeleted } from "./rxdb"

export const purgedDocuments = async (
  collection: RxCollection<Deployment>,
  api: DeploymentsApi,
): Promise<WithDeleted<Deployment>[]> => {
  const cached = await collection.find().exec()
  const missing: WithDeleted<Deployment>[] = []
  for (let offset = 0; offset < cached.length; offset += PULL_BATCH_SIZE) {
    const batch = cached.slice(offset, offset + PULL_BATCH_SIZE)
    // oxlint-disable-next-line no-await-in-loop -- bound reconciliation requests to one batch at a time
    const ids = new Set(await api.missingIds(batch.map((document) => document.primary)))
    for (const document of batch) {
      if (ids.has(document.primary)) missing.push({ ...document.toJSON(), _deleted: true })
    }
  }
  return missing
}
