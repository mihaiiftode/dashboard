import { z } from "zod"

export const STATUSES = ["active", "failed", "stopped"] as const
export const TYPES = ["web_service", "worker", "cron_job"] as const
export const ENVIRONMENTS = ["production", "staging", "development"] as const

const ATTRIBUTE_KEY_RULE = /^[a-z0-9_-]{1,64}$/u
const ATTRIBUTE_VALUE_MAX = 512

export const RESERVED_ATTRIBUTE_KEYS: ReadonlySet<string> = new Set([
  "id",
  "deployment_id",
  "status",
  "type",
  "env",
  "environment",
  "version",
  "creator",
  "created_by",
  "created",
  "created_at",
  "deleted",
  "deleted_at",
  "is",
])

const attributeKey = z
  .string()
  .regex(ATTRIBUTE_KEY_RULE, "must be 1 to 64 characters of a-z, 0-9, underscore or hyphen")
  .refine((key) => !RESERVED_ATTRIBUTE_KEYS.has(key), "is reserved by a built-in field")

const attributeValue = z
  .string()
  .min(1, "must not be blank")
  .max(ATTRIBUTE_VALUE_MAX, `must be at most ${ATTRIBUTE_VALUE_MAX} characters`)

const valueSchemas: Record<string, z.ZodType<string, string>> = {
  oncall: attributeValue.pipe(z.email("must be an email address")),
}

const valueSchemaFor = (key: string): z.ZodType<string, string> => valueSchemas[key] ?? attributeValue

export const attributeValueSchema = (key: string) => z.string().trim().pipe(valueSchemaFor(key))

export const attributeEntrySchema = z
  .object({ key: z.string().trim().toLowerCase().pipe(attributeKey), value: z.string() })
  .check((context) => {
    const checked = attributeValueSchema(context.value.key).safeParse(context.value.value)
    if (checked.success) return
    for (const issue of checked.error.issues)
      context.issues.push({ code: "custom", input: context.value.value, path: ["value"], message: issue.message })
  })

export const REQUIRED_ATTRIBUTE_KEYS: ReadonlySet<string> = new Set(["name"])

const attributeShape = {
  name: attributeValue,
  description: attributeValue.optional(),
  team: attributeValue.optional(),
  region: attributeValue.optional(),
  language: attributeValue.optional(),
  framework: attributeValue.optional(),
  priority: attributeValue.optional(),
  oncall: valueSchemaFor("oncall").optional(),
}

const attributesSchema = z
  .object(attributeShape)
  .catchall(attributeValue)
  .check((context) => {
    for (const key of Object.keys(context.value)) {
      if (attributeKey.safeParse(key).success) continue
      context.issues.push({ code: "custom", input: key, path: [key], message: `attribute key ${key} is not allowed` })
    }
  })

export const statusSchema = z.enum(STATUSES)
export const typeSchema = z.enum(TYPES)
export const environmentSchema = z.enum(ENVIRONMENTS)

export const deploymentSchema = z.object({
  deployment_id: z.uuid(),
  revision: z.int().min(1),
  version: attributeValue,
  status: statusSchema,
  type: typeSchema,
  environment: environmentSchema,
  attributes: attributesSchema,
  created_at: z.iso.datetime({ offset: true }),
  created_by: z.email(),
  updated_at: z.iso.datetime({ offset: true }),
  deleted_at: z.iso.datetime({ offset: true }).nullable(),
})

const checkpointSchema = z.object({
  updated_at: z.iso.datetime({ offset: true }),
  deployment_id: z.uuid(),
})

export const deploymentPageSchema = z.object({
  items: z.array(deploymentSchema),
  checkpoint: checkpointSchema.nullable(),
})

const writableSchema = deploymentSchema.pick({
  version: true,
  status: true,
  type: true,
  environment: true,
  attributes: true,
})

export const writableOf = (deployment: Deployment): WritableDeployment => writableSchema.parse(deployment)

export type WritableDeployment = z.infer<typeof writableSchema>
export type Deployment = z.infer<typeof deploymentSchema>
export type Checkpoint = z.infer<typeof checkpointSchema>
export type DeploymentPage = z.infer<typeof deploymentPageSchema>
export type Status = Deployment["status"]
export type DeploymentType = Deployment["type"]
export type Environment = Deployment["environment"]
