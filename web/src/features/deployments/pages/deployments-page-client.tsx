"use client"

import dynamic from "next/dynamic"
import { TableSkeleton } from "../components/table-skeleton"
import { DeploymentsStoreProvider } from "../store/store-context"
import type { DeploymentsPageProps } from "./deployments-page"

const DeploymentsPage = dynamic(async () => (await import("./deployments-page")).DeploymentsPage, {
  ssr: false,
  loading: () => <TableSkeleton />,
})

export const DeploymentsPageClient = (props: DeploymentsPageProps) => (
  <DeploymentsStoreProvider>
    <DeploymentsPage {...props} />
  </DeploymentsStoreProvider>
)
