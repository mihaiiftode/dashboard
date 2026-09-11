import { env } from "@/lib/env"
import { createFetchDeploymentsApi, SEED_PAGE_SIZE, type DeploymentsApi } from "./api"
import type { Checkpoint, Deployment, DeploymentPage } from "./schema"

export const PLANTED_COOKIE = "deployments-planted"

export type DeploymentsSeed = {
  cutoff: number
  rows: Deployment[]
  checkpoint: Checkpoint | null
}

export type SeededRows = { rows: Deployment[]; checkpoint: Checkpoint | null }

export const seedRows = async (
  maximum: number,
  api: DeploymentsApi = createFetchDeploymentsApi(env.API_ORIGIN ?? env.NEXT_PUBLIC_API_URL),
): Promise<SeededRows> => {
  const rows: Deployment[] = []
  let after: Checkpoint | null = null
  while (rows.length < maximum) {
    // oxlint-disable-next-line no-await-in-loop -- each page needs the previous checkpoint
    const page: DeploymentPage = await api.list({ after, limit: Math.min(SEED_PAGE_SIZE, maximum - rows.length) })
    rows.push(...page.items)
    after = page.checkpoint ?? reachedBy(rows.at(-1)) ?? after
    if (page.checkpoint === null || page.items.length === 0) break
  }
  return { rows, checkpoint: after }
}

const reachedBy = (row: Deployment | undefined): Checkpoint | null =>
  row === undefined ? null : { updated_at: row.updated_at, deployment_id: row.deployment_id }

export const seedStateOf = (seeded: SeededRows, cutoff: number): DeploymentsSeed => ({
  cutoff,
  rows: seeded.rows,
  checkpoint: seeded.checkpoint,
})
