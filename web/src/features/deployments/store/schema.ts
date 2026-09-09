import { z } from "zod"

export const STATUSES = ["active", "failed", "stopped"] as const
export const TYPES = ["web_service", "worker", "cron_job"] as const
export const ENVIRONMENTS = ["production", "staging", "development"] as const

export const ATTRIBUTE_KEY_RULE = /^[a-z0-9_-]{1,64}$/
const ATTRIBUTE_VALUE_MAX = 512

const attributeValue = z.string().min(1).max(ATTRIBUTE_VALUE_MAX)

export const attributesSchema = z
  .object({
    name: attributeValue,
    description: attributeValue.optional(),
    team: attributeValue.optional(),
    region: attributeValue.optional(),
    language: attributeValue.optional(),
    framework: attributeValue.optional(),
    priority: attributeValue.optional(),
    oncall: z.email().optional(),
  })
  .catchall(attributeValue)
  .check((context) => {
    for (const key of Object.keys(context.value)) {
      if (ATTRIBUTE_KEY_RULE.test(key)) continue
      context.issues.push({ code: "custom", input: key, path: [key], message: `attribute key ${key} is not allowed` })
    }
  })

export const deploymentSchema = z.object({
  deployment_id: z.uuid(),
  revision: z.int().min(1),
  version: attributeValue,
  status: z.enum(STATUSES),
  type: z.enum(TYPES),
  environment: z.enum(ENVIRONMENTS),
  attributes: attributesSchema,
  created_at: z.iso.datetime({ offset: true }),
  created_by: z.email(),
  updated_at: z.iso.datetime({ offset: true }),
  deleted_at: z.iso.datetime({ offset: true }).nullable(),
})

export const checkpointSchema = z.object({
  updated_at: z.iso.datetime({ offset: true }),
  deployment_id: z.uuid(),
})

export const deploymentPageSchema = z.object({
  items: z.array(deploymentSchema),
  checkpoint: checkpointSchema.nullable(),
})

export const writableSchema = deploymentSchema.pick({
  version: true,
  status: true,
  type: true,
  environment: true,
  attributes: true,
})

export const writableOf = (deployment: Deployment): WritableDeployment => writableSchema.parse(deployment)

export type Attributes = z.infer<typeof attributesSchema>
export type WritableDeployment = z.infer<typeof writableSchema>
export type Deployment = z.infer<typeof deploymentSchema>
export type Checkpoint = z.infer<typeof checkpointSchema>
export type DeploymentPage = z.infer<typeof deploymentPageSchema>
export type Status = Deployment["status"]
export type DeploymentType = Deployment["type"]
export type Environment = Deployment["environment"]
