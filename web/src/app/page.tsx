import { Suspense } from "react"
import { DeploymentsViewClient } from "@/components/deployments/client-views"

export default function Page() {
  return (
    <Suspense>
      <DeploymentsViewClient />
    </Suspense>
  )
}
