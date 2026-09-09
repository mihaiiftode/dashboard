"use client"

import dynamic from "next/dynamic"
import { TableSkeleton } from "./table-skeleton"

export const DeploymentsViewClient = dynamic(() => import("./deployments-view").then((m) => m.DeploymentsView), {
  ssr: false,
  loading: () => <TableSkeleton />,
})
