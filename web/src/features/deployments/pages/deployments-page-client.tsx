"use client"

import dynamic from "next/dynamic"
import { TableSkeleton } from "../components/table-skeleton"

export const DeploymentsPageClient = dynamic(
  () => import("./deployments-page").then((module) => module.DeploymentsPage),
  { ssr: false, loading: () => <TableSkeleton /> },
)
