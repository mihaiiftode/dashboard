export const STATUSES = ["active", "failed", "stopped"] as const
export const TYPES = ["web_service", "worker", "cron_job"] as const
export const ENVIRONMENTS = ["production", "staging", "development"] as const

export type Status = (typeof STATUSES)[number]
export type DeploymentType = (typeof TYPES)[number]
export type Environment = (typeof ENVIRONMENTS)[number]

export type Attributes = { name: string; description?: string } & Record<string, string | undefined>

export type Deployment = {
  deployment_id: string
  version: string
  status: Status
  type: DeploymentType
  environment: Environment
  attributes: Attributes
  created_at: string
  created_by: string
  updated_at: string
  deleted_at: string | null
}
