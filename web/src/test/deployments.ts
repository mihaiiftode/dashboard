import type { Deployment } from "@/features/deployments/store/schema"

const STATUSES = ["active", "failed", "stopped"] as const
const TYPES = ["web_service", "worker", "cron_job"] as const
const ENVIRONMENTS = ["production", "staging", "development"] as const
const TEAMS = ["payments", "checkout", "identity", "platform", "search"] as const
const REGIONS = ["us-east-1", "us-west-2", "eu-west-1", "ap-southeast-1"] as const
const PRIORITIES = ["critical", "high", "medium", "low"] as const

const BASE_MS = Date.parse("2026-03-01T12:00:00.000Z")
const MINUTE_MS = 60_000
const UUID_TEMPLATE = "00000000-0000-4000-8000-000000000000"

export const deploymentId = (index: number): string => {
  const suffix = String(index).padStart(12, "0")
  return `${UUID_TEMPLATE.slice(0, 24)}${suffix}`
}

export type DeploymentOverrides = Partial<Omit<Deployment, "attributes">> & {
  attributes?: Partial<Deployment["attributes"]>
}

export const deployment = (index: number, overrides: DeploymentOverrides = {}): Deployment => {
  const stamp = new Date(BASE_MS + index * MINUTE_MS).toISOString()
  const { attributes, ...rest } = overrides
  return {
    deployment_id: deploymentId(index),
    version: `1.${index % 20}.${index % 7}`,
    status: STATUSES[index % STATUSES.length],
    type: TYPES[index % TYPES.length],
    environment: ENVIRONMENTS[index % ENVIRONMENTS.length],
    attributes: {
      name: `service-${String(index).padStart(3, "0")}`,
      description: `Handles workload number ${index}.`,
      team: TEAMS[index % TEAMS.length],
      region: REGIONS[index % REGIONS.length],
      priority: PRIORITIES[index % PRIORITIES.length],
      ...attributes,
    },
    created_at: new Date(BASE_MS - MINUTE_MS).toISOString(),
    created_by: `engineer-${index % 4}@example.com`,
    updated_at: stamp,
    deleted_at: null,
    ...rest,
  }
}

export const deployments = (count: number, overrides: DeploymentOverrides = {}): Deployment[] =>
  Array.from({ length: count }, (_, index) => deployment(index, overrides))
