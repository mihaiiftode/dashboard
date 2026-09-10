import { Suspense } from "react"
import { retentionCutoff } from "@/features/deployments/query/compile"
import { seedRows, seedStateOf, type DeploymentsSeed } from "@/features/deployments/store/seed"
import { DeploymentsRoute } from "./deployments-route"

export const dynamic = "force-dynamic"

const SEED_ROWS = 10_000

const seedOrEmpty = async (): Promise<DeploymentsSeed> => {
  try {
    return seedStateOf(await seedRows(SEED_ROWS), retentionCutoff())
  } catch {
    return seedStateOf([], retentionCutoff())
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
