import type { DehydratedDbState } from "@tanstack/react-db"
import { env } from "@/lib/env"
import { createFetchDeploymentsApi, SEED_PAGE_SIZE } from "./api"
import { COLLECTION_ID } from "./collection-id"
import type { Checkpoint, Deployment, DeploymentPage } from "./schema"

export type DeploymentsSeed = {
  state: DehydratedDbState
  cutoff: number
}

export const seedRows = async (maximum: number): Promise<Deployment[]> => {
  const api = createFetchDeploymentsApi(env.API_ORIGIN ?? env.NEXT_PUBLIC_API_URL)
  const rows: Deployment[] = []
  let after: Checkpoint | null = null
  while (rows.length < maximum) {
    // oxlint-disable-next-line no-await-in-loop -- each page needs the previous checkpoint
    const page: DeploymentPage = await api.list({ after, limit: Math.min(SEED_PAGE_SIZE, maximum - rows.length) })
    rows.push(...page.items)
    if (page.checkpoint === null || page.items.length === 0) break
    after = page.checkpoint
  }
  return rows
}

export const seedStateOf = (rows: readonly Deployment[], cutoff: number): DeploymentsSeed => ({
  cutoff,
  state: {
    collections: [
      {
        collectionId: COLLECTION_ID,
        rows: rows.map((row) => ({ key: row.deployment_id, value: row })),
      },
    ],
  },
})
