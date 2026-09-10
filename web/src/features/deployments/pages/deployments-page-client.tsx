"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import { DbClient, DbProvider, HydrationBoundary } from "@tanstack/react-db"
import { TableSkeleton } from "../components/table-skeleton"
import { DeploymentsStoreProvider } from "../store/store-context"
import { RetentionCutoffProvider } from "../store/use-retention-cutoff"
import type { DeploymentsSeed } from "../store/seed"
import type { DeploymentsPageProps } from "./deployments-page"

const DeploymentsPage = dynamic(async () => (await import("./deployments-page")).DeploymentsPage, {
  ssr: false,
  loading: () => <TableSkeleton />,
})

export type DeploymentsPageClientProps = DeploymentsPageProps & { seed: DeploymentsSeed }

export const DeploymentsPageClient = ({ seed, ...props }: DeploymentsPageClientProps) => {
  const [client] = useState(() => new DbClient())
  return (
    <DbProvider client={client}>
      <HydrationBoundary state={seed.state}>
        <RetentionCutoffProvider cutoff={seed.cutoff}>
          <DeploymentsStoreProvider>
            <DeploymentsPage {...props} />
          </DeploymentsStoreProvider>
        </RetentionCutoffProvider>
      </HydrationBoundary>
    </DbProvider>
  )
}
