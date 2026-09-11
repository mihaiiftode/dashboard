"use client"

import type { ReactNode } from "react"
import { AlertTriangleIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"

export type FeatureBoundaryProps = {
  loading: boolean
  error: Error | null
  pending: ReactNode
  onRetry: () => void
  children: ReactNode
}

export const FeatureBoundary = ({ loading, error, pending, onRetry, children }: FeatureBoundaryProps) => {
  if (error) return <LoadFailure error={error} onRetry={onRetry} />
  if (loading) return pending
  return children
}

const LoadFailure = ({ error, onRetry }: { error: Error; onRetry: () => void }) => (
  <Empty className="flex-1" data-slot="load-failure" role="alert">
    <EmptyHeader>
      <EmptyMedia variant="icon">
        <AlertTriangleIcon />
      </EmptyMedia>
      <EmptyTitle>Deployments could not load</EmptyTitle>
      <EmptyDescription>{error.message}</EmptyDescription>
    </EmptyHeader>
    <Button variant="outline" size="sm" onClick={onRetry}>
      Try again
    </Button>
  </Empty>
)
