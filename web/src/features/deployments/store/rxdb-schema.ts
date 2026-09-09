import { z } from "zod"
import { deploymentSchema } from "./schema"

export const PRIMARY_KEY = "deployment_id"
const PRIMARY_KEY_MAX_LENGTH = 36

type JsonSchemaObject = {
  type: string
  properties: Record<string, unknown>
  required?: string[]
  additionalProperties?: boolean
}

export const rxdbDeploymentSchema = () => {
  const converted = z.toJSONSchema(deploymentSchema, {
    io: "output",
    target: "draft-7",
    unrepresentable: "any",
  }) as unknown as JsonSchemaObject
  const properties = {
    ...converted.properties,
    [PRIMARY_KEY]: { type: "string", maxLength: PRIMARY_KEY_MAX_LENGTH },
  }
  return {
    version: 0,
    primaryKey: PRIMARY_KEY,
    type: "object",
    properties,
    required: [...new Set([...(converted.required ?? []), PRIMARY_KEY])],
    additionalProperties: false,
  } as const
}
