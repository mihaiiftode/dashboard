import { Suspense } from "react"
import { DeploymentsRoute } from "./deployments-route"

export default function Page() {
  return (
    <Suspense>
      <DeploymentsRoute />
    </Suspense>
  )
}
