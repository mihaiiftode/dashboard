import { DAY_MS, ENVIRONMENTS, STATUSES, TYPES, type Deployment } from "@/features/deployments/store/schema"
const TEAMS = ["payments", "checkout", "identity", "platform", "search"] as const
const REGIONS = ["us-east-1", "us-west-2", "eu-west-1", "ap-southeast-1"] as const
const PRIORITIES = ["critical", "high", "medium", "low"] as const

const BASE_MS = Date.parse("2026-03-01T12:00:00.000Z")
const MINUTE_MS = 60_000

const hexDigitsFor = (index: number): string => {
  let state = (index + 1) * 2654435761
  let digits = ""
  while (digits.length < 32) {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    digits += (state >>> 0).toString(16).padStart(8, "0")
  }
  return digits.slice(0, 32)
}

const deploymentId = (index: number): string => {
  const hex = hexDigitsFor(index)
  const withVersion = `${hex.slice(0, 12)}4${hex.slice(13, 16)}`
  const withVariant = `8${hex.slice(17, 20)}`
  return [
    withVersion.slice(0, 8),
    withVersion.slice(8, 12),
    withVersion.slice(12, 16),
    withVariant,
    hex.slice(20, 32),
  ].join("-")
}

export const deletedDaysAgo = (days = 1): string => new Date(Date.now() - days * DAY_MS).toISOString()

export type DeploymentOverrides = Partial<Omit<Deployment, "attributes">> & {
  attributes?: Partial<Deployment["attributes"]>
}

export const deployment = (index: number, overrides: DeploymentOverrides = {}): Deployment => {
  const stamp = new Date(BASE_MS + index * MINUTE_MS).toISOString()
  const { attributes, ...rest } = overrides
  return {
    deployment_id: deploymentId(index),
    revision: 1,
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
    created_at: new Date(BASE_MS - DAY_MS + index * MINUTE_MS).toISOString(),
    created_by: `engineer-${index % 4}@example.com`,
    updated_at: stamp,
    deleted_at: null,
    ...rest,
  }
}

export const deployments = (count: number, overrides: DeploymentOverrides = {}): Deployment[] =>
  Array.from({ length: count }, (_, index) => deployment(index, overrides))
