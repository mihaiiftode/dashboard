import { ATTRIBUTE_KEY_RULE, ATTRIBUTE_VALUE_MAX } from "./schema"

const KEY_REASON = "must be 1 to 64 characters of a-z, 0-9, underscore or hyphen"
const BLANK_REASON = "must not be blank"
const LENGTH_REASON = `must be at most ${ATTRIBUTE_VALUE_MAX} characters`
const EMAIL_REASON = "must be an email address"

const EMAIL_RULE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u

const keyViolation = (key: string): string | null => (ATTRIBUTE_KEY_RULE.test(key) ? null : KEY_REASON)

export const valueViolation = (key: string, value: string): string | null => {
  const trimmed = value.trim()
  if (trimmed === "") return BLANK_REASON
  if (trimmed.length > ATTRIBUTE_VALUE_MAX) return LENGTH_REASON
  if (key === "oncall" && !EMAIL_RULE.test(trimmed)) return EMAIL_REASON
  return null
}

export const entryViolation = (key: string, value: string): string | null =>
  keyViolation(key) ?? valueViolation(key, value)
