import { Suspense } from "react"
import { cookies } from "next/headers"
import { retentionCutoff } from "@/features/deployments/query/compile"
import { PLANTED_COOKIE, seedRows, seedStateOf, type DeploymentsSeed } from "@/features/deployments/store/seed"
import { DeploymentsRoute } from "./deployments-route"

export const dynamic = "force-dynamic"

const SEED_ROWS = 10_000

const empty = (): DeploymentsSeed => seedStateOf({ rows: [], checkpoint: null }, retentionCutoff())

const seedOrEmpty = async (): Promise<DeploymentsSeed> => {
  if ((await cookies()).get(PLANTED_COOKIE)?.value === "1") return empty()
  try {
    return seedStateOf(await seedRows(SEED_ROWS), retentionCutoff())
  } catch {
    return empty()
  }
}

export default async function Page() {
  const seed = await seedOrEmpty()
  return (
    <Suspense>
      <DeploymentsRoute seed={seed} />
    </Suspense>
  )
}
